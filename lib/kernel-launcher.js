/** @babel */

/**
 * Spawning local Jupyter kernels over ZMQ.
 *
 * Replaces nteract's `spawnteract`, abandoned in 2020. Its
 * helpers have all become Node builtins since — `mkdirp` is
 * `fs.mkdirSync({recursive})`, `jsonfile` is `fs.promises.writeFile`, `uuid` is
 * `crypto.randomUUID`, `portfinder` is a listen on port 0 — so only the process
 * handling still earns a dependency: `cross-spawn` resolves PATHEXT and `.cmd`
 * shims on Windows, which bare `child_process.spawn` refuses to run.
 *
 * `launch` (by kernel name) is not carried over; this package resolves its
 * kernelspecs itself and only ever launches from a spec it already holds.
 *
 * @see https://jupyter-client.readthedocs.io/en/stable/kernels.html#connection-files
 * @see https://jupyter-client.readthedocs.io/en/stable/kernels.html#kernel-specs
 */

import crypto from "crypto";
import fs from "fs";
import net from "net";
import path from "path";

import spawn from "cross-spawn";

import { runtimeDir } from "./jupyter-paths";

// Jupyter's connection file names five channels, in this order.
const CHANNELS = ["hb_port", "control_port", "shell_port", "stdin_port", "iopub_port"];

const CONNECTION_FILE_TOKEN = "{connection_file}";

/**
 * Binds a server to an OS-assigned free port on the loopback interface.
 *
 * @return {Promise<net.Server>} the listening server; the caller must close it
 */
function listenOnEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    // Never hold the event loop open on account of a probe.
    server.unref();
    server.once("error", reject);
    // `exclusive` keeps the port off a shared cluster handle, so the number we
    // read back is genuinely ours.
    server.listen({ port: 0, host: "127.0.0.1", exclusive: true }, () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// Windows environment variable names are case-insensitive, so a caller's `Path`
// and a kernelspec's `PATH` name the same variable. Handing both to
// CreateProcess is at best redundant and at worst drops one of them.
const CASE_INSENSITIVE_ENV = process.platform === "win32";

/**
 * The key under which `name` is actually stored in `env`, or undefined when it
 * is absent.
 */
function findEnvKey(env, name) {
  if (Object.prototype.hasOwnProperty.call(env, name)) return name;
  if (!CASE_INSENSITIVE_ENV) return undefined;
  const upper = name.toUpperCase();
  return Object.keys(env).find((key) => key.toUpperCase() === upper);
}

// `$$` escapes a literal dollar sign; `$NAME` and `${NAME}` expand.
const ENV_TEMPLATE = /\$(?:(\$)|\{([^{}]*)\}|([A-Za-z_][A-Za-z0-9_]*))?/g;

/**
 * Expands environment references in a kernelspec `env` value against `env`.
 *
 * An unknown name — or a bare `$` — is left exactly as written rather than
 * blanked, matching Python's `string.Template.safe_substitute` and therefore
 * Jupyter itself. This is what lets a kernelspec extend a variable instead of
 * replacing it, e.g. `"PATH": "/opt/env/bin:${PATH}"`.
 */
function expandEnvTemplate(value, env) {
  if (typeof value !== "string" || !value.includes("$")) return value;
  return value.replace(ENV_TEMPLATE, (match, escaped, braced, bare) => {
    if (escaped) return "$";
    const name = braced !== undefined ? braced : bare;
    if (name === undefined) return match;
    const key = findEnvKey(env, name);
    return key === undefined ? match : env[key];
  });
}

/**
 * Applies a kernelspec's own `env` on top of the environment it will run in.
 *
 * @param  {Object}  env       the environment so far
 * @param  {?Object} specEnv   the kernelspec's `env`, if it declares one
 * @return {Object}
 */
function applyKernelSpecEnv(env, specEnv) {
  if (!specEnv) return env;
  const merged = { ...env };
  for (const [name, value] of Object.entries(specEnv)) {
    // References resolve against the environment as it was before the
    // kernelspec touched it, so entries cannot see each other and their order
    // in kernel.json cannot change the result.
    merged[findEnvKey(merged, name) ?? name] = expandEnvTemplate(value, env);
  }
  return merged;
}

/**
 * Picks `count` distinct free ports.
 *
 * All the probes are held open at once and only then released, which is what
 * makes the ports distinct from each other. They are still only *probably* free
 * by the time the kernel binds them — nothing can reserve a port on behalf of
 * another process — but that race predates this code and has never been a
 * problem in practice.
 *
 * @param  {number} count
 * @return {Promise<number[]>}
 */
async function reservePorts(count) {
  const servers = [];
  try {
    for (let i = 0; i < count; i++) {
      servers.push(await listenOnEphemeralPort());
    }
    return servers.map((server) => server.address().port);
  } finally {
    await Promise.all(servers.map(closeServer));
  }
}

/**
 * Builds the connection info a kernel needs to talk to us.
 *
 * @param  {number[]} ports one port per entry of CHANNELS
 * @return {Object}
 */
function createConnectionInfo(ports) {
  const config = {
    version: 5,
    // Shared secret the kernel and this process sign every message with.
    key: crypto.randomUUID(),
    signature_scheme: "hmac-sha256",
    transport: "tcp",
    ip: "127.0.0.1",
  };
  CHANNELS.forEach((channel, i) => {
    config[channel] = ports[i];
  });
  return config;
}

/**
 * Writes a connection file for a kernel that has not started yet.
 *
 * @return {Promise<{config: Object, connectionFile: string}>}
 */
export async function writeConnectionFile() {
  const ports = await reservePorts(CHANNELS.length);
  const config = createConnectionInfo(ports);

  const dir = runtimeDir();
  // Created synchronously before the write: upstream fired an un-awaited mkdirp
  // here, so the write could lose the race on a machine that had never run
  // Jupyter before.
  fs.mkdirSync(dir, { recursive: true });

  const connectionFile = path.join(dir, `kernel-${crypto.randomUUID()}.json`);
  await fs.promises.writeFile(connectionFile, JSON.stringify(config));

  return { config, connectionFile };
}

function removeConnectionFile(connectionFile) {
  try {
    fs.unlinkSync(connectionFile);
  } catch {
    // Already gone, or never written.
  }
}

/**
 * Starts a kernel against connection info that already exists on disk. Stays
 * synchronous because restarting a kernel reuses its connection file and has to
 * hand back the new process in the same tick.
 *
 * @param  {Object} kernelSpec      a Jupyter kernelspec, i.e. the parsed kernel.json
 * @param  {Object} config          connection info, as written to `connectionFile`
 * @param  {string} connectionFile  path to the connection file
 * @param  {Object} [spawnOptions]  child_process options, plus
 *                                  `cleanupConnectionFile: false` to keep the
 *                                  file when the process goes away
 * @return {{spawn: ChildProcess, connectionFile: string, config: Object, kernelSpec: Object}}
 */
export function launchSpecFromConnectionInfo(kernelSpec, config, connectionFile, spawnOptions) {
  // Kernels take the path to their connection file as an argv placeholder. A
  // replacer function keeps `$&` and friends literal, in case the path contains
  // one.
  const argv = kernelSpec.argv.map((arg) =>
    arg.replaceAll(CONNECTION_FILE_TOKEN, () => connectionFile),
  );

  const { cleanupConnectionFile = true, ...childOptions } = spawnOptions || {};
  // This process's environment, then whatever the caller passed. Callers here
  // pass a full copy of process.env, but unlike spawnteract a caller passing a
  // *partial* env no longer strips PATH from the kernel.
  const env = { ...process.env, ...(spawnOptions && spawnOptions.env) };
  const options = {
    stdio: "ignore",
    ...childOptions,
    // The kernelspec's own `env` wins over all of it, as it does in Jupyter's
    // own client. spawnteract had this backwards: a caller passing an env at
    // all — which is the only way to set a kernel's cwd-adjacent variables —
    // silently disabled every `env` entry the kernel author had written.
    env: applyKernelSpecEnv(env, kernelSpec.env),
  };

  const kernelProcess = spawn(argv[0], argv.slice(1), options);

  if (cleanupConnectionFile) {
    kernelProcess.on("exit", () => removeConnectionFile(connectionFile));
    kernelProcess.on("error", () => removeConnectionFile(connectionFile));
  }

  return { spawn: kernelProcess, connectionFile, config, kernelSpec };
}

/**
 * Starts a kernel, allocating it a fresh connection file.
 *
 * @param  {Object} kernelSpec
 * @param  {Object} [spawnOptions]
 * @return {Promise<{spawn: ChildProcess, connectionFile: string, config: Object, kernelSpec: Object}>}
 */
export async function launchSpec(kernelSpec, spawnOptions) {
  const { config, connectionFile } = await writeConnectionFile();
  return launchSpecFromConnectionInfo(kernelSpec, config, connectionFile, spawnOptions);
}

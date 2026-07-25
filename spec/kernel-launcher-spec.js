/** @babel */

import fs from "fs";
import os from "os";
import path from "path";

import {
  launchSpec,
  launchSpecFromConnectionInfo,
  writeConnectionFile,
} from "../lib/kernel-launcher";

// Kernel launching used to come from nteract's `spawnteract`, abandoned in
// 2020. These specs pin the parts of its contract this package relies on: the
// shape of the connection file, the `{connection_file}` argv substitution, and
// the cleanup-on-exit behaviour that restarting a kernel deliberately disables.
describe("kernel launcher", () => {
  let root;
  let savedRuntimeDir;
  let savedRunAsNode;

  // A kernel that exits immediately, so specs never leave a process behind.
  // `process.execPath` is Electron under the spec runner, so the stand-in
  // kernels only behave like `node -e` with ELECTRON_RUN_AS_NODE set, which
  // beforeEach puts in this process's environment for the children to inherit.
  function nodeSpec(script, ...args) {
    return { display_name: "spec kernel", argv: [process.execPath, "-e", script, ...args] };
  }

  function waitForExit(child) {
    return new Promise((resolve, reject) => {
      child.on("exit", (code) => resolve(code));
      child.on("error", reject);
    });
  }

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jove-repl-launch-")));
    savedRuntimeDir = process.env.JUPYTER_RUNTIME_DIR;
    // Point the runtime directory at a path that does not exist yet, so the
    // specs also cover creating it.
    process.env.JUPYTER_RUNTIME_DIR = path.join(root, "runtime");
    savedRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
    process.env.ELECTRON_RUN_AS_NODE = "1";
  });

  afterEach(() => {
    if (savedRuntimeDir === undefined) {
      delete process.env.JUPYTER_RUNTIME_DIR;
    } else {
      process.env.JUPYTER_RUNTIME_DIR = savedRuntimeDir;
    }
    if (savedRunAsNode === undefined) {
      delete process.env.ELECTRON_RUN_AS_NODE;
    } else {
      process.env.ELECTRON_RUN_AS_NODE = savedRunAsNode;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("writeConnectionFile", () => {
    it("creates the runtime directory and writes the connection info to it", async () => {
      const { config, connectionFile } = await writeConnectionFile();

      expect(fs.existsSync(connectionFile)).toBe(true);
      expect(path.dirname(connectionFile)).toBe(process.env.JUPYTER_RUNTIME_DIR);
      expect(JSON.parse(fs.readFileSync(connectionFile, "utf8"))).toEqual(config);
    });

    it("describes all five channels on distinct ports", async () => {
      const { config } = await writeConnectionFile();

      const ports = [
        config.hb_port,
        config.control_port,
        config.shell_port,
        config.stdin_port,
        config.iopub_port,
      ];
      for (const port of ports) {
        expect(typeof port).toBe("number");
        expect(port).toBeGreaterThan(0);
      }
      // Distinctness is the whole reason the probes are held open together.
      expect(new Set(ports).size).toBe(5);
    });

    it("carries the signing key and transport the kernel protocol requires", async () => {
      const { config } = await writeConnectionFile();

      expect(config.version).toBe(5);
      expect(typeof config.key).toBe("string");
      expect(config.key.length).toBeGreaterThan(0);
      expect(config.signature_scheme).toBe("hmac-sha256");
      expect(config.transport).toBe("tcp");
      expect(config.ip).toBe("127.0.0.1");
    });

    it("gives each kernel its own connection file", async () => {
      const first = await writeConnectionFile();
      const second = await writeConnectionFile();

      expect(first.connectionFile).not.toBe(second.connectionFile);
      expect(first.config.key).not.toBe(second.config.key);
    });
  });

  describe("launchSpecFromConnectionInfo", () => {
    it("substitutes the connection file into argv, even through regexp-special paths", async () => {
      const report = path.join(root, "argv.txt");
      // `$&` is meaningful to String.replace's replacement string; a path
      // containing one must still arrive at the kernel verbatim.
      const connectionFile = path.join(root, "conn$&ection.json");
      fs.writeFileSync(connectionFile, "{}");

      const spec = nodeSpec(
        "require('fs').writeFileSync(process.argv[1], process.argv[2])",
        report,
        "{connection_file}",
      );
      const { spawn } = launchSpecFromConnectionInfo(spec, {}, connectionFile, {
        cleanupConnectionFile: false,
      });
      await waitForExit(spawn);

      expect(fs.readFileSync(report, "utf8")).toBe(connectionFile);
    });

    it("returns the process synchronously, as the restart path needs", () => {
      const connectionFile = path.join(root, "sync.json");
      fs.writeFileSync(connectionFile, "{}");
      const config = { key: "abc" };

      const result = launchSpecFromConnectionInfo(nodeSpec(""), config, connectionFile, {
        cleanupConnectionFile: false,
      });

      expect(typeof result.spawn.kill).toBe("function");
      expect(result.connectionFile).toBe(connectionFile);
      expect(result.config).toBe(config);
      return waitForExit(result.spawn);
    });

    it("removes the connection file once the kernel exits", async () => {
      const connectionFile = path.join(root, "cleaned.json");
      fs.writeFileSync(connectionFile, "{}");

      const { spawn } = launchSpecFromConnectionInfo(nodeSpec(""), {}, connectionFile);
      await waitForExit(spawn);

      expect(fs.existsSync(connectionFile)).toBe(false);
    });

    it("keeps the connection file when cleanup is disabled, so a restart can reuse it", async () => {
      const connectionFile = path.join(root, "kept.json");
      fs.writeFileSync(connectionFile, "{}");

      const { spawn } = launchSpecFromConnectionInfo(nodeSpec(""), {}, connectionFile, {
        cleanupConnectionFile: false,
      });
      await waitForExit(spawn);

      expect(fs.existsSync(connectionFile)).toBe(true);
    });

    it("does not leak the cleanup flag into the child process options", async () => {
      const report = path.join(root, "env.txt");
      const connectionFile = path.join(root, "env.json");
      fs.writeFileSync(connectionFile, "{}");

      const spec = nodeSpec(
        "require('fs').writeFileSync(process.argv[1], process.env.JOVE_SPEC_VAR || '')",
        report,
      );
      const { spawn } = launchSpecFromConnectionInfo(spec, {}, connectionFile, {
        cleanupConnectionFile: false,
        env: { ...process.env, JOVE_SPEC_VAR: "from-caller" },
      });
      await waitForExit(spawn);

      expect(fs.readFileSync(report, "utf8")).toBe("from-caller");
    });

    it("passes the kernelspec's own env to the kernel", async () => {
      const report = path.join(root, "spec-env.txt");
      const connectionFile = path.join(root, "spec-env.json");
      fs.writeFileSync(connectionFile, "{}");

      const spec = nodeSpec(
        "require('fs').writeFileSync(process.argv[1], process.env.JOVE_SPEC_FROM_KERNEL || '')",
        report,
      );
      spec.env = { JOVE_SPEC_FROM_KERNEL: "from-kernelspec" };
      const { spawn } = launchSpecFromConnectionInfo(spec, {}, connectionFile, {
        cleanupConnectionFile: false,
      });
      await waitForExit(spawn);

      expect(fs.readFileSync(report, "utf8")).toBe("from-kernelspec");
    });
  });

  describe("launchSpec", () => {
    it("allocates a connection file and starts the kernel against it", async () => {
      const report = path.join(root, "launched.txt");
      const spec = nodeSpec(
        "require('fs').writeFileSync(process.argv[1], process.argv[2])",
        report,
        "{connection_file}",
      );

      const { spawn, connectionFile, config } = await launchSpec(spec, {
        cleanupConnectionFile: false,
      });
      await waitForExit(spawn);

      expect(fs.readFileSync(report, "utf8")).toBe(connectionFile);
      expect(JSON.parse(fs.readFileSync(connectionFile, "utf8")).key).toBe(config.key);
    });
  });
});

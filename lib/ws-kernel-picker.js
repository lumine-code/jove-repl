/** @babel */

import { v4 as uuidv4 } from "uuid";
import http from "http";
import https from "https";
import ws from "ws";
import { XMLHttpRequest as NodeXMLHttpRequest } from "xmlhttprequest";
import { URL } from "url";
import path from "path";
import {
  SessionAPI,
  KernelSpecAPI,
  KernelManager,
  SessionManager,
  ServerConnection,
} from "@jupyterlab/services";
import Config from "./config";
import WSKernel from "./ws-kernel";
import store from "./store";
import { tildify } from "./utils";

const CLASS_NAME = "jupyter-repl ws-kernel-picker";

// Connecting to a remote kernel is a sequence of choices — gateway,
// credentials, session, kernel spec — so each step is a frame pushed onto the
// same modal session. Escape backs out one step at a time; there is no
// hand-rolled hide/show dance and no reassignable `onConfirmed`.
export default class WSKernelPicker {
  constructor(onChosen) {
    this._onChosen = onChosen;
  }

  toggle(kernelSpecFilter) {
    this._kernelSpecFilter = kernelSpecFilter;
    const gateways = Config.getJson("gateways") || [];

    if (!gateways.length) {
      atom.notifications.addError("No remote kernel gateways available", {
        description:
          "Use Jupyter: Open Gateways Config to edit gateways.json. Jupyter can use remote kernels on either a Jupyter Kernel Gateway or Jupyter notebook server.",
      });
      return null;
    }

    // Use only filename for Jupyter API (requires relative path, not absolute)
    const fileName = store.filePath ? path.basename(store.filePath) : "unsaved";
    this._path = `${fileName}-${uuidv4()}`;

    return atom.modals.open(this.gatewaySpec(gateways));
  }

  // ── step 1: which gateway ──────────────────────────────────────────────────

  gatewaySpec(gateways) {
    return {
      id: "jupyter-repl.ws-gateways",
      className: CLASS_NAME,
      emptyMessage: "No gateways available",
      source: (req) => {
        req.progress({ message: "Select a gateway", severity: "info" });
        return gateways;
      },
      renderer: {
        entry: (item) => ({ id: item, text: item.name }),
        row: (item) => ({ label: item.name }),
      },
      confirm: ({ item }) => {
        // Spread the gateway config once; the credential steps below layer
        // their factories and headers onto this same object.
        const gatewayOptions = { ...item.options };
        if (!gatewayOptions.token) {
          return { push: this.credentialsSpec(item, gatewayOptions) };
        }
        return { push: this.sessionsSpec(item, gatewayOptions) };
      },
    };
  }

  // ── step 2: how to authenticate ────────────────────────────────────────────

  credentialsSpec(gatewayInfo, gatewayOptions) {
    return {
      id: "jupyter-repl.ws-credentials",
      className: CLASS_NAME,
      source: (req) => {
        req.progress({ message: "Select authentication method", severity: "info" });
        return [
          { name: "No credentials", action: "none" },
          { name: "Authenticate with a token", action: "token" },
          { name: "Authenticate with a cookie", action: "cookie" },
        ];
      },
      renderer: {
        entry: (item) => ({ id: item.action, text: item.name }),
        row: (item) => ({ label: item.name }),
      },
      confirm: ({ item }) => {
        if (item.action === "none") {
          return { push: this.sessionsSpec(gatewayInfo, gatewayOptions) };
        }
        return { push: this.credentialSpec(item.action, gatewayInfo, gatewayOptions) };
      },
    };
  }

  // ── step 3: the secret itself ──────────────────────────────────────────────

  // A masked input frame rather than a separate modal panel: escaping it pops
  // back to the method list, so a mistyped token can be retried without
  // restarting the whole connection.
  credentialSpec(kind, gatewayInfo, gatewayOptions) {
    const isToken = kind === "token";
    const label = document.createElement("label");
    label.classList.add("label", "icon", "icon-arrow-right");
    label.textContent = isToken ? "Token:" : "Cookie:";

    return {
      id: isToken ? "jupyter-repl.ws-token" : "jupyter-repl.ws-cookie",
      className: CLASS_NAME,
      template: "input",
      password: true,
      header: label,
      confirm: ({ query }) => {
        const value = query.text;
        if (!value) {
          atom.notifications.addInfo(
            isToken ? "Token authentication cancelled" : "Cookie authentication cancelled",
          );
          return { pop: true };
        }
        if (isToken) {
          gatewayOptions.token = value;
        } else {
          applyCookie(gatewayOptions, value);
        }
        return { push: this.sessionsSpec(gatewayInfo, gatewayOptions) };
      },
    };
  }

  // ── step 4: which running session ──────────────────────────────────────────

  sessionsSpec(gatewayInfo, gatewayOptions) {
    return {
      id: "jupyter-repl.ws-sessions",
      className: CLASS_NAME,
      emptyMessage: "No sessions available",
      // A run whose frame has moved on is aborted, so none of the awaits below
      // need a "is this still the gateway I started with?" guard.
      source: async (req) => {
        req.progress({ busy: true, message: "Loading sessions…" });

        // Set default factories only if not already configured (e.g. by cookie auth)
        if (!gatewayOptions.xhrFactory) {
          gatewayOptions.xhrFactory = () => new XMLHttpRequest();
        }
        if (!gatewayOptions.wsFactory) {
          gatewayOptions.wsFactory = (url, protocol) => {
            if (gatewayOptions.token) {
              const urlObj = new URL(url);
              urlObj.searchParams.set("token", gatewayOptions.token);
              url = urlObj.toString();
            }
            return new ws(url, protocol);
          };
        }

        try {
          await this.checkGatewayReachable(gatewayOptions);
        } catch (error) {
          this.showGatewayConnectionError(error, gatewayOptions);
          req.session.cancel("api");
          return [];
        }

        const serverSettings = ServerConnection.makeSettings(gatewayOptions);

        let specModels;
        try {
          specModels = await KernelSpecAPI.getSpecs(serverSettings);
        } catch (error) {
          const errorMessage = error.message || error.xhr?.responseText || "";
          const status = error.response?.status || error.xhr?.status;
          if (status === 403 || status === 401 || errorMessage.includes("Forbidden")) {
            atom.notifications.addError("Authentication failed", {
              detail: `Server returned ${status || "Forbidden"}. Check your credentials and try again.`,
              dismissable: true,
            });
          } else {
            this.showGatewayConnectionError(error, gatewayOptions);
          }
          req.session.cancel("api");
          return [];
        }

        const kernelSpecs = Object.values(specModels.kernelspecs).filter((spec) =>
          this._kernelSpecFilter(spec),
        );

        if (kernelSpecs.length === 0) {
          req.session.cancel("api");
          atom.notifications.addError(
            "There are no kernels that match the grammar of the currently open file.",
          );
          return [];
        }

        const kernelNames = kernelSpecs.map((specModel) => specModel.name);

        let sessionModels;
        try {
          sessionModels = await SessionAPI.listRunning(serverSettings);
        } catch (error) {
          const status = error.response?.status || error.xhr?.status;
          if (status === 403 || status === 401) {
            atom.notifications.addError("Authentication failed", {
              detail: `Server returned ${status}. Check your credentials and try again.`,
              dismissable: true,
            });
          } else {
            this.showGatewayConnectionError(error, gatewayOptions);
          }
          req.session.cancel("api");
          return [];
        }

        sessionModels = sessionModels.filter((model) => {
          const name = model.kernel ? model.kernel.name : null;
          return name ? kernelNames.includes(name) : true;
        });

        const items = sessionModels.map((model) => {
          const name = model.path
            ? tildify(model.path)
            : model.notebook?.path
              ? tildify(model.notebook.path)
              : `Session ${model.id}`;

          return {
            name,
            model,
            options: serverSettings,
          };
        });

        items.unshift({
          name: "[new session]",
          model: null,
          options: serverSettings,
          kernelSpecs,
        });

        req.progress({ busy: false, message: null });
        return items;
      },
      renderer: {
        // Two sessions can be running the same notebook path, so identity is
        // the item itself rather than its label.
        entry: (item) => ({ id: item, text: item.name }),
        row: (item) => ({ label: item.name }),
      },
      confirm: ({ item }) => {
        if (!item.model) {
          return { push: this.kernelSpecsSpec(gatewayInfo.name, item) };
        }
        // Returning nothing closes the modal now, as the old picker did: the
        // handshake below can take seconds and there is nothing left to pick.
        this.connectToSession(gatewayInfo.name, item).catch(reportConnectionFailure);
      },
    };
  }

  // ── step 5: which kernel spec for a brand new session ──────────────────────

  kernelSpecsSpec(gatewayName, sessionInfo) {
    return {
      id: "jupyter-repl.ws-kernel-specs",
      className: CLASS_NAME,
      emptyMessage: "No kernel specs available",
      source: (req) => {
        req.progress({ message: "Select a session", severity: "info" });
        return sessionInfo.kernelSpecs.map((spec) => ({
          name: spec.display_name,
          options: {
            serverSettings: sessionInfo.options,
            kernelName: spec.name,
            path: this._path,
          },
        }));
      },
      renderer: {
        entry: (item) => ({ id: item.options.kernelName, text: item.name }),
        row: (item) => ({ label: item.name }),
      },
      confirm: ({ item }) => {
        this.startSession(gatewayName, item).catch(reportConnectionFailure);
      },
    };
  }

  // ── connection helpers ─────────────────────────────────────────────────────

  showGatewayConnectionError(error, gatewayOptions) {
    const errorMessage = error.message || error.xhr?.responseText || String(error);
    const networkErrors = [
      "Failed to fetch",
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ECONNRESET",
      "Connection timed out",
    ];
    const isNetworkError = networkErrors.some((message) => errorMessage.includes(message));

    if (isNetworkError) {
      atom.notifications.addError("Gateway server is not reachable", {
        description:
          "Check that the Jupyter server is running and that the gateway baseUrl, port, and protocol are correct.",
        detail: `Gateway: ${gatewayOptions.baseUrl}\nError: ${errorMessage}`,
        dismissable: true,
      });
      return;
    }

    atom.notifications.addError("Connection to gateway failed", {
      description: "Jupyter could not load kernel specs from the selected gateway.",
      detail: `Gateway: ${gatewayOptions.baseUrl}\nError: ${errorMessage}`,
      dismissable: true,
    });
  }

  checkGatewayReachable(gatewayOptions) {
    return new Promise((resolve, reject) => {
      let requestUrl;
      try {
        requestUrl = new URL("api/kernelspecs", gatewayOptions.baseUrl.replace(/\/?$/, "/"));
      } catch (error) {
        reject(error);
        return;
      }

      const requestLibrary = requestUrl.protocol === "https:" ? https : http;
      const request = requestLibrary.get(requestUrl, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", reject);
      request.setTimeout(5000, () => {
        request.destroy(new Error(`Connection timed out: ${requestUrl.toString()}`));
      });
    });
  }

  async connectToSession(gatewayName, sessionInfo) {
    const kernelManager = new KernelManager({
      serverSettings: sessionInfo.options,
    });
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options,
      kernelManager,
    });

    const model = await sessionInfo.model;
    await sessionManager.refreshRunning();
    const session = sessionManager.connectTo({
      serverSettings: sessionInfo.options,
      model,
    });

    await this.onSessionChosen(gatewayName, session, { sessionManager, kernelManager });
  }

  async startSession(gatewayName, sessionInfo) {
    const kernelManager = new KernelManager({
      serverSettings: sessionInfo.options.serverSettings,
    });
    const sessionManager = new SessionManager({
      serverSettings: sessionInfo.options.serverSettings,
      kernelManager,
    });

    const model = await SessionAPI.startSession(
      {
        ...sessionInfo.options,
        type: "notebook",
        name: "none",
        kernel: {
          name: sessionInfo.options.kernelName,
        },
        path: sessionInfo.options.path,
      },
      sessionInfo.options.serverSettings,
    );

    await sessionManager.refreshRunning();
    const session = sessionManager.connectTo({ model });

    await this.onSessionChosen(gatewayName, session, { sessionManager, kernelManager });
  }

  async onSessionChosen(gatewayName, session, managers = {}) {
    await session.kernel.ready;
    const kernelSpec = await session.kernel.spec;
    if (!store.grammar) return;

    const kernel = new WSKernel(gatewayName, kernelSpec, store.grammar, session, managers);
    this._onChosen(kernel);
  }
}

// Cookie auth cannot go through the browser's XMLHttpRequest: it refuses to set
// a Cookie header, so both the REST and the WebSocket transport are replaced.
function applyCookie(options, cookie) {
  if (!options.requestHeaders) {
    options.requestHeaders = {};
  }

  options.requestHeaders.Cookie = cookie;

  options.xhrFactory = () => {
    const request = new NodeXMLHttpRequest();
    request.setDisableHeaderCheck(true);
    return request;
  };

  options.wsFactory = (url, protocol) => {
    const parsedUrl = new URL(url);
    parsedUrl.protocol = parsedUrl.protocol === "wss:" ? "https:" : "http:";
    return new ws(url, protocol, {
      headers: { Cookie: cookie },
      origin: parsedUrl.origin,
      host: parsedUrl.host,
    });
  };
}

// The modal is already gone by the time the handshake runs, so a failure has
// nowhere to render but a notification.
function reportConnectionFailure(error) {
  atom.notifications.addError("Could not connect to the Jupyter session", {
    detail: error && error.stack ? error.stack : String(error),
    dismissable: true,
  });
}

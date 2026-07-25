/** @babel */

import fs from "fs";
import path from "path";

const Config = {
  getJson(key, _default = {}) {
    if (key === "gateways") {
      return this.getGateways(Array.isArray(_default) ? _default : []);
    }

    const value = atom.config.get(`jove-repl.${key}`);
    if (!value || typeof value !== "string") {
      return _default;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      const message = `Your Jove config is broken: ${key}`;
      atom.notifications.addError(message, {
        detail: error,
      });
    }

    return _default;
  },

  getGatewaysPath() {
    return path.join(atom.getConfigDirPath(), "gateways.json");
  },

  openGateways() {
    const gatewaysPath = this.getGatewaysPath();
    this.ensureGatewaysFile(gatewaysPath);
    return atom.workspace.open(gatewaysPath);
  },

  getGateways(_default = []) {
    const gatewaysPath = this.getGatewaysPath();
    this.ensureGatewaysFile(gatewaysPath);

    try {
      const gateways = JSON.parse(fs.readFileSync(gatewaysPath, "utf8"));
      if (!Array.isArray(gateways)) {
        throw new Error("Expected gateways.json to contain an array of gateway objects");
      }
      return gateways || _default;
    } catch (error) {
      atom.notifications.addError("Your Jove gateways config is broken", {
        detail: error.message || String(error),
        dismissable: true,
      });
    }

    return _default;
  },

  ensureGatewaysFile(gatewaysPath) {
    if (fs.existsSync(gatewaysPath)) {
      return;
    }

    let contents = "[]\n";
    const oldValue = atom.config.get("jove-repl.gateways");
    let migratedOldSetting = false;

    if (oldValue && typeof oldValue === "string") {
      try {
        contents = `${JSON.stringify(JSON.parse(oldValue), null, 2)}\n`;
        migratedOldSetting = true;
      } catch (error) {
        atom.notifications.addWarning("Could not migrate Jove gateways setting", {
          detail: error.message || String(error),
          dismissable: true,
        });
      }
    }

    fs.mkdirSync(path.dirname(gatewaysPath), { recursive: true });
    fs.writeFileSync(gatewaysPath, contents);

    if (migratedOldSetting) {
      atom.config.unset("jove-repl.gateways");
    }
  },
};
export default Config;

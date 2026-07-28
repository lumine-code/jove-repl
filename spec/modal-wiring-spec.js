/** @babel */

import fs from "fs";
import path from "path";

const { activeSession, cancel, confirm, modalElement, settle } = require(
  path.join(atom.getLoadSettings().resourcePath, "spec", "helpers", "modal-helpers"),
);

// The pickers moved onto `atom.modals`. Nothing else in the suite opens a
// modal, so these specs cover the two ways that move can fail silently: a
// module whose interop shape the caller guessed wrong, and a row descriptor
// that only survives its first paint.
describe("modal wiring", () => {
  it("exports the existing-kernel picker as a directly callable module", () => {
    // `@lumine-code/babel-preset` runs `add-module-exports`, which collapses a
    // lone default export onto `module.exports` — so `require(...).default` is
    // undefined and `main.js` has to call the module itself.
    const toggleExistingKernelPicker = require("../lib/existing-kernel-picker");
    expect(typeof toggleExistingKernelPicker).toBe("function");
    expect(toggleExistingKernelPicker.default).toBeUndefined();

    // …and the call site must not reach through the property that does not
    // exist. `store` and `data-explorer-store` may — they export more than a
    // default, so their `exports.default` survives.
    const main = fs.readFileSync(path.join(__dirname, "..", "lib", "main.js"), "utf8");
    expect(main).not.toContain('require("./existing-kernel-picker").default');
  });

  describe("the exec panel", () => {
    let panel;

    beforeEach(() => {
      const ExecPanel = require("../lib/exec-panel");
      panel = new ExecPanel({ kernel: null });
      panel.addToHistory("print(1)", "ok");
    });

    afterEach(async () => {
      if (activeSession()) cancel();
      await settle();
      panel.destroy();
    });

    it("keeps each history row's status line across a re-render", async () => {
      panel.toggle();
      await settle();

      const secondaryLines = () =>
        Array.from(modalElement().querySelectorAll("ol.list-group > li .secondary-line")).map(
          (line) => line.textContent,
        );

      expect(secondaryLines().length).toBe(1);
      expect(secondaryLines()[0]).not.toBe("");

      // Enter on an empty query stays open and repaints WITHOUT re-filtering,
      // so the cached row descriptor is reused. A DocumentFragment there would
      // already have been emptied by the first paint.
      confirm();
      await settle();

      expect(activeSession()).not.toBeNull();
      expect(secondaryLines().length).toBe(1);
      expect(secondaryLines()[0]).not.toBe("");
    });
  });
});

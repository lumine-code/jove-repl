/** @babel */
/* global describe, it, expect */

import fs from "fs";
import path from "path";

// Guards for the CSON -> JSON and Less -> CSS migrations. If someone
// reintroduces a CSON keymap/menu or a Less stylesheet, these fail.
describe("hydrogen-next package assets", () => {
  const root = path.join(__dirname, "..");

  it("provides keymaps and menus as JSON, not CSON", () => {
    expect(fs.existsSync(path.join(root, "keymaps/hydrogen-next.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "menus/hydrogen-next.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "keymaps/hydrogen-next.cson"))).toBe(false);
    expect(fs.existsSync(path.join(root, "menus/hydrogen-next.cson"))).toBe(false);
  });

  it("ships keymap and menu JSON that parse", () => {
    const keymap = JSON.parse(
      fs.readFileSync(path.join(root, "keymaps/hydrogen-next.json"), "utf8"),
    );
    expect(keymap["atom-workspace"]).toBeDefined();

    const menu = JSON.parse(fs.readFileSync(path.join(root, "menus/hydrogen-next.json"), "utf8"));
    expect(Array.isArray(menu.menu)).toBe(true);
    // Every menu entry must use the valid `command` key, never the `commands`
    // typo that silently disabled two entries in the old CSON menu.
    expect(JSON.stringify(menu)).not.toContain('"commands"');
  });

  it("ships a CSS stylesheet built on custom properties, not Less", () => {
    expect(fs.existsSync(path.join(root, "styles/hydrogen-next.css"))).toBe(true);
    expect(fs.existsSync(path.join(root, "styles/hydrogen-next.less"))).toBe(false);

    const css = fs.readFileSync(path.join(root, "styles/hydrogen-next.css"), "utf8");
    expect(css).toContain("var(--");
    // No leftover Less imports or color functions.
    expect(css).not.toContain('@import "ui-variables"');
    expect(css).not.toContain('@import "syntax-variables"');
    expect(css).not.toMatch(/\blighten\(|\bfadein\(|\bcontrast\(/);
  });
});

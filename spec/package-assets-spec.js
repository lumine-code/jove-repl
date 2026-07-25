/** @babel */

import fs from "fs";
import path from "path";

// Guards for the CSON -> JSON and Less -> CSS migrations. If someone
// reintroduces a CSON keymap/menu or a Less stylesheet, these fail.
describe("jove-repl package assets", () => {
  const root = path.join(__dirname, "..");

  it("provides keymaps and menus as JSON, not CSON", () => {
    expect(fs.existsSync(path.join(root, "keymaps/jove-repl.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "menus/jove-repl.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "keymaps/jove-repl.cson"))).toBe(false);
    expect(fs.existsSync(path.join(root, "menus/jove-repl.cson"))).toBe(false);
  });

  it("ships keymap and menu JSON that parse", () => {
    const keymap = JSON.parse(fs.readFileSync(path.join(root, "keymaps/jove-repl.json"), "utf8"));
    expect(keymap["atom-workspace"]).toBeDefined();

    const menu = JSON.parse(fs.readFileSync(path.join(root, "menus/jove-repl.json"), "utf8"));
    expect(Array.isArray(menu.menu)).toBe(true);
    // Every menu entry must use the valid `command` key, never the `commands`
    // typo that silently disabled two entries in the old CSON menu.
    expect(JSON.stringify(menu)).not.toContain('"commands"');
  });

  it("ships a CSS stylesheet built on custom properties, not Less", () => {
    expect(fs.existsSync(path.join(root, "styles/jove-repl.css"))).toBe(true);
    expect(fs.existsSync(path.join(root, "styles/jove-repl.less"))).toBe(false);

    const css = fs.readFileSync(path.join(root, "styles/jove-repl.css"), "utf8");
    expect(css).toContain("var(--");
    expect(css).not.toContain('@import "ui-variables"');
    expect(css).not.toContain('@import "syntax-variables"');
    // No leftover Less color functions (ignore prose in comments).
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(cssWithoutComments).not.toMatch(
      /\blighten\(|\bfadein\(|\bcontrast\(|\baverage\(|\bfade\(/,
    );
  });
});

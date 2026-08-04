const fs = require("fs");
const path = require("path");

// The package is migrating off the `/** @babel */` pragma onto plain
// CommonJS. During the migration both formats coexist, and the seam between
// them is silent: nothing type-checks a `require`, so a module that exports its
// class as `module.exports` but is read as `.default` just yields `undefined`
// and fails much later. These specs pin the two rules that seam depends on.

const LIB = path.join(__dirname, "..", "lib");

function eachLibFile(visit) {
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.jsx?$/.test(entry.name)) {
        visit(full, path.relative(LIB, full).split(path.sep).join("/"));
      }
    }
  })(LIB);
}

function isBabel(source) {
  return source.startsWith("/** @babel */");
}

describe("module format", () => {
  it("keeps the pragma only on files that still need Babel", () => {
    const offenders = [];
    eachLibFile((full, rel) => {
      const source = fs.readFileSync(full, "utf8");
      if (!isBabel(source)) {
        return;
      }
      // JSX and the mobx `@observer` decorator are the only things left that
      // Babel is carrying. A pragma without either is dead weight.
      const needsBabel = /@jsx\s|["']react["']|["']mobx-react["']|^\s*@observer/m.test(source);
      if (!needsBabel) {
        offenders.push(rel);
      }
    });
    expect(offenders).toEqual([]);
  });

  it("has no CommonJS module reading a Babel default that is not there", () => {
    // `@lumine-code/babel-preset` runs with `addModuleExports: true` and
    // `addModuleExportsDefaultProperty: false`. A Babel module whose only
    // export is the default therefore exports it as `module.exports`, with no
    // `.default` property; one that also has named exports keeps `.default`.
    const shapes = new Map();
    eachLibFile((full, rel) => {
      const source = fs.readFileSync(full, "utf8");
      if (!isBabel(source)) {
        shapes.set(rel, "cjs");
        return;
      }
      const hasDefault = /^export\s+default[\s{]/m.test(source);
      const hasNamed =
        /^export\s+(class|function|const|let|var|async)\b/m.test(source) ||
        /^export\s*\{/m.test(source);
      shapes.set(rel, hasDefault && !hasNamed ? "default-is-module-exports" : "namespace");
    });

    const resolveFrom = (fromRel, spec) => {
      const base = path
        .join(path.dirname(fromRel), spec)
        .split(path.sep)
        .join("/")
        .replace(/^\.\//, "");
      for (const candidate of [`${base}.js`, `${base}.jsx`, `${base}/index.js`]) {
        if (shapes.has(candidate)) return candidate;
      }
      return null;
    };

    const offenders = [];
    eachLibFile((full, rel) => {
      const source = fs.readFileSync(full, "utf8");
      if (isBabel(source)) {
        return;
      }
      source.split(/\r?\n/).forEach((line, index) => {
        const match = line.match(/require\(\s*["'](\.[^"']+)["']\s*\)(\s*\.\s*default\b)?/);
        if (!match) return;
        const target = resolveFrom(rel, match[1]);
        if (!target) return;
        const readsDefault = Boolean(match[2]);
        const shape = shapes.get(target);
        if (shape === "default-is-module-exports" && readsDefault) {
          offenders.push(`${rel}:${index + 1} reads .default from ${target}, which has none`);
        }
        if (shape === "cjs" && readsDefault) {
          offenders.push(`${rel}:${index + 1} reads .default from CommonJS ${target}`);
        }
      });
    });
    expect(offenders).toEqual([]);
  });
});

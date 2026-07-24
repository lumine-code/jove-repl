module.exports = {
  root: true,
  extends: "eslint:recommended",
  env: { es2022: true, browser: true, node: true },
  globals: { atom: "readonly" },
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  // The espree parser can't parse the legacy `@observer` class decorator that
  // these mobx-react components use, so they are excluded from linting (the
  // editor's Babel transpiler still compiles them at runtime).
  ignorePatterns: [
    "node_modules/",
    ".dev/",
    "examples/",
    "lib/components/data-explorer.js",
    "lib/components/inspector.js",
    "lib/components/output-area.js",
    "lib/components/result-view/display.js",
    "lib/components/result-view/list.js",
    "lib/components/result-view/result-view.js",
    "lib/components/variable-explorer.js",
    "lib/services/consumed/status-bar/status-bar-component.js",
  ],
  rules: {
    "no-unused-vars": "off",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-constant-condition": ["error", { checkLoops: false }],
  },
};

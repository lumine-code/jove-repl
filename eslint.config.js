const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");
const babelParser = require("@babel/eslint-parser");
const jsx = require("./eslint-jsx");

module.exports = [
  {
    // Vendored kernel examples and the local dev sandbox ship as-is.
    ignores: ["node_modules/**", ".dev/**", "examples/**", "assets/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      // Lumine transpiles this package's `/** @babel */` sources with legacy
      // decorators, which espree cannot parse; use the same parser eslint-side
      // so the mobx `@observer` components are linted like everything else.
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          // Syntax plugins only: eslint parses, it never transpiles.
          parserOpts: { plugins: ["jsx", ["decorators", { version: "legacy" }]] },
        },
      },
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        atom: "readonly",
      },
    },
    plugins: { jsx },
    rules: {
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "jsx/jsx-uses": "error",
    },
  },
  {
    // This config and its helper are dev tooling, loaded by eslint as CommonJS.
    files: ["eslint.config.js", "eslint-jsx.js", "prettier.config.js"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    // Specs run in the Lumine jasmine runner.
    files: ["spec/**", "**/*-spec.js"],
    languageOptions: { globals: { ...globals.jasmine } },
  },
  // Must be last: turns off lint rules that would conflict with Prettier.
  prettier,
];

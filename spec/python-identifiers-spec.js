const { inspectorStore } = require("../lib/store/inspector-store");
const { dataExplorerStore, buildSerializerCode } = require("../lib/store/data-explorer-store");

// The Data Explorer and the inspector both drive a Python kernel by generating
// helper code around the user's expression. The package renames ran a blanket
// sed that reached inside those Python strings: `_hydrogen_data_explorer`
// became `_jove-repl_data_explorer` (0c835ab) and then
// `_jupyter-repl_data_explorer` (fdd198d), because both new package names
// carry a hyphen. A hyphen is not legal in a Python identifier, so every one of
// these helpers was a SyntaxError and both panels failed against a real kernel.
// Nothing caught it, because no spec had ever looked at the generated source.

// Identifier positions in the emitted Python. Deliberately not a blanket ban on
// hyphens: the code contains string literals that legitimately hold one, such
// as the "<data-explorer>" filename passed to compile().
const DEF = /^[ \t]*def[ \t]+([^\s(]+)[ \t]*\(/gm;
const DEL = /^[ \t]*del[ \t]+([^\s\n]+)/gm;
// Every token the rename could have touched, wherever it appears.
const OUR_HELPERS = /_{1,2}jupyter[A-Za-z0-9_-]*/g;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function namesAt(code, pattern) {
  return [...code.matchAll(pattern)].map((match) => match[1]);
}

function expectValidPythonIdentifiers(code) {
  const defs = namesAt(code, DEF);
  const dels = namesAt(code, DEL);
  const helpers = code.match(OUR_HELPERS) || [];

  // Guard the guard: a builder that stopped emitting a def would otherwise
  // pass every assertion below by having nothing to check.
  expect(defs.length).toBeGreaterThan(0);
  expect(helpers.length).toBeGreaterThan(0);

  for (const name of [...defs, ...dels, ...helpers]) {
    expect(name).toMatch(IDENTIFIER);
    expect(name).not.toContain("-");
  }
}

// A kernel that records the code it is asked to run, so the assertions read the
// exact string the panels send over the wire, and keeps the callbacks so a spec
// can drive the exchange forward.
function recordingKernel(captured) {
  return {
    language: "python",
    displayName: "Python 3",
    inspected: [],
    executeWatch(code, onResults) {
      captured.push({ code, onResults });
    },
    execute(code, onResults) {
      captured.push({ code, onResults });
    },
    inspect(expression, cursorPos, onResults) {
      this.inspected.push(expression);
      onResults({ found: true, data: { "text/plain": "ok" } });
    },
  };
}

describe("generated Python helper code", () => {
  afterEach(() => {
    inspectorStore.reset();
    dataExplorerStore.reset();
  });

  it("names the data explorer serializer with a valid identifier", () => {
    expectValidPythonIdentifiers(buildSerializerCode("df"));
  });

  it("sends the data explorer valid identifiers for a real expression", () => {
    const captured = [];
    dataExplorerStore.load(recordingKernel(captured), "df");

    expect(captured.length).toBe(1);
    expectValidPythonIdentifiers(captured[0].code);
    expect(captured[0].code).toContain("def _jupyter_repl_data_explorer():");
  });

  it("sends the inspector valid identifiers", () => {
    const captured = [];
    inspectorStore.load(recordingKernel(captured), "obj.attr");

    expect(captured.length).toBe(1);
    expectValidPythonIdentifiers(captured[0].code);
    expect(captured[0].code).toContain("def _jupyter_repl_inspector_eval():");
  });

  it("keeps the inspector result target parseable on its own", () => {
    // The target is not only a globals() key: once the helper has run, it is
    // handed back to the kernel as the expression to inspect, so a hyphen there
    // is a second, separate SyntaxError.
    const captured = [];
    const kernel = recordingKernel(captured);
    inspectorStore.load(kernel, "obj.attr");

    // Report the helper as having run, which is what sends the target back.
    captured[0].onResults({ stream: "status", data: "ok" });

    expect(kernel.inspected.length).toBeGreaterThan(0);
    const target = kernel.inspected[0];
    expect(target).toMatch(IDENTIFIER);
    expect(target).toContain("jupyter_repl");
    // The same name the helper was told to assign to.
    expect(captured[0].code).toContain(`_target = "${target}"`);
  });
});

const store = require("../lib/store");

// The store used to derive the current kernel through mobx, so every consumer
// re-read it for free and `filePath` was a cached computed. Both are plain now:
// the kernel change is announced by whoever mutates the state, and nothing
// caches. These specs pin the two behaviours that depended on mobx.

describe("store kernel tracking", () => {
  let previousEditor;
  let previousActivePaneItem;
  let editor;

  function fakeKernel(name = "Python 3") {
    return {
      displayName: name,
      grammar: { name: "Python", scopeName: "source.python" },
      language: "python",
    };
  }

  beforeEach(async () => {
    previousEditor = store.editor;
    previousActivePaneItem = store.activePaneItem;
    editor = await atom.workspace.open();
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
  });

  afterEach(() => {
    store.kernelMapping.clear();
    store.runningKernels = [];
    editor.destroy();
    // Only hand back what is still alive: the store reads the grammar off
    // whatever editor it is given, and an earlier spec may have destroyed the
    // one that was current when this file started.
    const live = previousEditor && !previousEditor.isDestroyed() ? previousEditor : null;
    store.updateEditor(live);
    store.updateActivePaneItem(live ? previousActivePaneItem : null);
  });

  it("announces the current kernel when one is mapped to the active file", () => {
    const seen = [];
    const subscription = store.onDidChangeCurrentKernel((kernel) => seen.push(kernel));
    const kernel = fakeKernel();

    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, kernel]]));
    store._emitKernelsChanged();

    expect(store.kernel).toBe(kernel);
    expect(seen).toEqual([kernel]);
    subscription.dispose();
  });

  it("stays quiet when a change leaves the same kernel current", () => {
    const kernel = fakeKernel();
    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, kernel]]));
    store._emitKernelsChanged();

    let calls = 0;
    const subscription = store.onDidChangeCurrentKernel(() => calls++);

    // Re-announcing the same state must not look like a change.
    store._emitKernelsChanged();
    store.updateActivePaneItem(editor);

    expect(calls).toBe(0);
    subscription.dispose();
  });

  it("announces the change when the active pane item moves away", () => {
    const kernel = fakeKernel();
    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, kernel]]));
    store._emitKernelsChanged();

    const seen = [];
    const subscription = store.onDidChangeCurrentKernel((k) => seen.push(k));

    // A non-editor centre item with no path of its own has no kernel.
    store.updateActivePaneItem({ getURI: () => "lumine://something-else" });

    expect(store.kernel).toBe(null);
    expect(seen).toEqual([null]);
    subscription.dispose();
  });

  it("moves a kernel from its unsaved placeholder onto the saved path", () => {
    // An editor with no path is keyed by its id; saving has to carry the
    // kernel over, or it is stranded under a key nothing looks up again.
    const unsavedKey = `Unsaved Editor ${editor.id}`;
    const kernel = fakeKernel();
    // A mapping holds either a Kernel or a grammar-name map; the map is the
    // shape a spec can build without a real kernel.
    const mapping = new Map([[store.grammar.name, kernel]]);
    store.kernelMapping.set(unsavedKey, mapping);

    const savedPath = "/tmp/saved-by-spec.py";
    spyOn(editor, "getPath").andReturn(savedPath);
    store.forceEditorUpdate();

    expect(store.kernelMapping.has(unsavedKey)).toBe(false);
    expect(store.kernelMapping.get(savedPath)).toBe(mapping);
  });

  it("leaves the mapping alone when the editor was never unsaved", () => {
    const savedPath = "/tmp/already-saved.py";
    spyOn(editor, "getPath").andReturn(savedPath);
    const mapping = new Map([[store.grammar.name, fakeKernel()]]);
    store.kernelMapping.set(savedPath, mapping);

    store.forceEditorUpdate();

    expect(store.kernelMapping.get(savedPath)).toBe(mapping);
    expect(store.kernelMapping.size).toBe(1);
  });
});

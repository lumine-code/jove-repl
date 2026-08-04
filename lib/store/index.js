const { CompositeDisposable, Disposable, Emitter, watchFile } = require("atom");
const { observable, computed, action, keys, makeObservable, autorun } = require("mobx");
const {
  isMultilanguageGrammar,
  getEmbeddedScope,
  isUnsavedFilePath,
  grammarToLanguage,
} = require("../utils");
const codeManager = require("../code-manager");
const MarkerStore = require("./markers");
const Kernel = require("../kernel");
const dataExplorerStore = require("./data-explorer-store");
const inspectorStore = require("./inspector-store");

const DATA_EXPLORER_URI = "lumine://jupyter-repl/data-explorer";
const INSPECTOR_URI = "lumine://jupyter-repl/inspector";

class Store {
  subscriptions = new CompositeDisposable();
  // Event layer for non-mobx consumers. Lives for the process lifetime, like
  // the store singleton itself, so it is deliberately not part of dispose().
  emitter = new Emitter();
  markersMapping = new Map();
  runningKernels = [];
  kernelMapping = new Map();
  startingKernels = new Map();
  editor = atom.workspace.getActiveTextEditor();
  activePaneItem = atom.workspace.getCenter().getActivePaneItem();
  grammar;
  configMapping = new Map();
  globalMode = Boolean(atom.config.get("jupyter-repl.globalMode"));
  // Allow external packages (like jupyter-view) to set the current kernel directly
  _externalKernel = null;
  _externalKernelContext = null;

  constructor() {
    makeObservable(this, {
      markersMapping: observable,
      runningKernels: observable,
      kernelMapping: observable,
      startingKernels: observable,
      editor: observable,
      activePaneItem: observable,
      grammar: observable,
      configMapping: observable,
      _externalKernel: observable,
      _externalKernelContext: observable,
      kernel: computed,
      filePath: computed,
      filePaths: computed,
      notebook: computed,
      markers: computed,
      newMarkerStore: action,
      startKernel: action,
      newKernel: action,
      remapKernelKey: action,
      deleteKernel: action,
      dispose: action,
      updateEditor: action,
      updateActivePaneItem: action,
      setGrammar: action,
      setConfigValue: action,
      setExternalKernel: action,
    });

    // The current kernel is derived from many observables (active pane item,
    // editor, grammar, kernel mapping, external kernel, panel stores), so while
    // mobx is still present an autorun is the one change source that cannot
    // miss a path. When mobx goes, this becomes explicit checks in every
    // mutating action (and subscriptions to the panel stores' update events).
    this._lastEmittedKernel = null;
    autorun(() => {
      const kernel = this.kernel;
      if (kernel !== this._lastEmittedKernel) {
        this._lastEmittedKernel = kernel;
        this.emitter.emit("did-change-current-kernel", kernel);
      }
    });
  }

  /**
   * Invoke the callback whenever the kernel for the current context (active
   * editor / pane item) changes, including to null. The current value can be
   * read synchronously from `store.kernel`.
   * @param {Function} callback - Called with the new kernel or null
   * @returns {Disposable}
   */
  onDidChangeCurrentKernel(callback) {
    return this.emitter.on("did-change-current-kernel", callback);
  }

  /**
   * Invoke the callback whenever a kernel starts running.
   * @param {Function} callback - Called with the kernel
   * @returns {Disposable}
   */
  onDidAddKernel(callback) {
    return this.emitter.on("did-add-kernel", callback);
  }

  /**
   * Invoke the callback whenever a running kernel is removed.
   * @param {Function} callback - Called with the kernel
   * @returns {Disposable}
   */
  onDidRemoveKernel(callback) {
    return this.emitter.on("did-remove-kernel", callback);
  }

  get kernel() {
    // When the Data Explorer pane is the active center item, report the kernel
    // it is bound to, so the status bar (and other consumers) reflect the data
    // being shown rather than the last focused editor's kernel.
    const activeItem = this.activePaneItem;
    if (
      activeItem &&
      typeof activeItem.getURI === "function" &&
      activeItem.getURI() === DATA_EXPLORER_URI
    ) {
      return dataExplorerStore.kernel || null;
    }
    if (
      activeItem &&
      typeof activeItem.getURI === "function" &&
      activeItem.getURI() === INSPECTOR_URI
    ) {
      return inspectorStore.kernel || null;
    }

    // External kernel takes priority (set by jupyter-view or other packages).
    // Honor it only while it is still running and its context matches; a stale
    // reference is cleared in deleteKernel (a computed must stay side-effect free).
    if (
      this._externalKernel &&
      this.runningKernels.includes(this._externalKernel) &&
      this._externalKernelContextMatches()
    ) {
      return this._externalKernel;
    }

    // The status bar (and other consumers) must follow the active center pane
    // item, not the sticky editor reference. The editor is kept sticky when
    // focus moves to a non-editor center item (e.g. a dock) so those docks keep
    // working, but when the active center item is a different document (e.g. a
    // Jupyter notebook handled by an adapter) we must resolve that item's own
    // kernel, never the sticky editor's.
    if (!this._activePaneItemIsTextEditor()) {
      return this._kernelForActiveItemPath();
    }

    if (!this.grammar || !this.editor) {
      return null;
    }

    if (this.globalMode) {
      // Compare kernel languages rather than scope names so dialect grammars
      // (e.g. IPython for .ipy, scope source.python.ipy) share the kernel
      // started for their base language.
      const currentLanguage = grammarToLanguage(this.grammar);
      return this.runningKernels.find((k) => grammarToLanguage(k.grammar) === currentLanguage);
    }

    const file = this.filePath;
    if (!file) {
      return null;
    }
    const kernelOrMap = this.kernelMapping.get(file);
    if (!kernelOrMap) {
      return null;
    }
    if (kernelOrMap instanceof Kernel) {
      return kernelOrMap;
    }
    return this.grammar && this.grammar.name ? kernelOrMap.get(this.grammar.name) : null;
  }

  get filePath() {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const savedFilePath = editor.getPath();
    return savedFilePath ? savedFilePath : `Unsaved Editor ${editor.id}`;
  }

  get filePaths() {
    return keys(this.kernelMapping);
  }

  get notebook() {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const commutable = require("@nteract/commutable");
    let notebook = commutable.emptyNotebook;

    if (this.kernel) {
      notebook = notebook.setIn(["metadata", "kernelspec"], this.kernel.transport.kernelSpec);
    }

    const cellRanges = codeManager.getCells(editor);

    cellRanges.forEach((cell) => {
      const { start, end } = cell;
      let source = codeManager.getTextInRange(editor, start, end);
      source = source ? source : "";
      // When the cell marker following a given cell range is on its own line,
      // the newline immediately preceding that cell marker is included in
      // `source`. We remove that here. See #1512 for more details.
      if (source.slice(-1) === "\n") {
        source = source.slice(0, -1);
      }
      const cellType = codeManager.getMetadataForRow(editor, start);
      let newCell;

      if (cellType === "codecell") {
        newCell = commutable.emptyCodeCell.set("source", source);
      } else if (cellType === "markdown") {
        source = codeManager.removeCommentsMarkdownCell(editor, source);
        newCell = commutable.emptyMarkdownCell.set("source", source);
      }

      notebook = commutable.appendCellToNotebook(notebook, newCell);
    });

    return commutable.toJS(notebook);
  }

  get markers() {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const markerStore = this.markersMapping.get(editor.id);
    return markerStore ? markerStore : this.newMarkerStore(editor.id);
  }

  newMarkerStore(editorId) {
    const markerStore = new MarkerStore();
    this.markersMapping.set(editorId, markerStore);
    return markerStore;
  }

  startKernel(kernelDisplayName) {
    this.startingKernels.set(kernelDisplayName, true);
  }

  addFileDisposer(editor, filePath) {
    const fileDisposer = new CompositeDisposable();

    if (isUnsavedFilePath(filePath)) {
      fileDisposer.add(
        editor.onDidSave((event) => {
          fileDisposer.dispose();
          this.addFileDisposer(editor, event.path); // Add another `fileDisposer` once it's saved
        }),
      );
      fileDisposer.add(
        editor.onDidDestroy(() => {
          this.kernelMapping.delete(filePath);
          fileDisposer.dispose();
        }),
      );
    } else {
      // Lumine dropped the synchronous `File` path-watcher API (backed by the
      // old `pathwatcher`) in favor of the async `watchFile`, which is served by
      // the `@parcel/watcher` worker. Subscriptions register synchronously, but
      // the underlying watch is armed asynchronously, so we drop the kernel
      // mapping whenever its backing file is deleted (or renamed away) and tear
      // the watcher down with the disposer to avoid leaking OS resources.
      const file = watchFile(filePath);
      const dropMapping = () => {
        this.kernelMapping.delete(filePath);
        fileDisposer.dispose();
      };
      fileDisposer.add(file.onDidDelete(dropMapping), new Disposable(() => file.dispose()));
    }

    this.subscriptions.add(fileDisposer);
  }

  newKernel(kernel, filePath, editor, grammar) {
    if (isMultilanguageGrammar(editor.getGrammar())) {
      if (!this.kernelMapping.has(filePath)) {
        this.kernelMapping.set(filePath, new Map());
      }
      const multiLanguageMap = this.kernelMapping.get(filePath);
      if (multiLanguageMap && typeof multiLanguageMap.set === "function") {
        multiLanguageMap.set(grammar.name, kernel);
      }
    } else {
      this.kernelMapping.set(filePath, kernel);
    }

    this.addFileDisposer(editor, filePath);
    const index = this.runningKernels.findIndex((k) => k === kernel);

    if (index === -1) {
      this.runningKernels.push(kernel);
      this.emitter.emit("did-add-kernel", kernel);
    }

    // delete startingKernel since store.kernel now in place to prevent duplicate kernel
    this.startingKernels.delete(kernel.kernelSpec.display_name);
  }

  remapKernelKey(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey || !this.kernelMapping.has(oldKey)) {
      return;
    }

    const existing = this.kernelMapping.get(newKey);
    const incoming = this.kernelMapping.get(oldKey);
    if (existing instanceof Kernel && incoming instanceof Kernel) {
      this.kernelMapping.set(newKey, incoming);
    } else if (existing && typeof existing.set === "function" && incoming) {
      if (incoming instanceof Kernel) {
        existing.set(incoming.grammar.name, incoming);
      } else if (typeof incoming.forEach === "function") {
        incoming.forEach((kernel, grammarName) => existing.set(grammarName, kernel));
      }
    } else {
      this.kernelMapping.set(newKey, incoming);
    }
    this.kernelMapping.delete(oldKey);

    if (this._externalKernelContext?.filePath === oldKey) {
      this._externalKernelContext = {
        ...this._externalKernelContext,
        filePath: newKey,
      };
    }
  }

  deleteKernel(kernel) {
    const grammar = kernel.grammar.name;
    const files = this.getFilesForKernel(kernel);
    files.forEach((file) => {
      const kernelOrMap = this.kernelMapping.get(file);
      if (!kernelOrMap) {
        return;
      }

      if (kernelOrMap instanceof Kernel) {
        this.kernelMapping.delete(file);
      } else {
        kernelOrMap.delete(grammar);
      }
    });
    const previousCount = this.runningKernels.length;
    this.runningKernels = this.runningKernels.filter((k) => k !== kernel);

    // Drop the external-kernel reference here (in an action) once its kernel is
    // gone, rather than mutating observables inside the `kernel` computed.
    if (this._externalKernel === kernel) {
      this._externalKernel = null;
      this._externalKernelContext = null;
    }

    if (this.runningKernels.length !== previousCount) {
      this.emitter.emit("did-remove-kernel", kernel);
    }
  }

  getFilesForKernel(kernel) {
    const grammar = kernel.grammar.name;
    return this.filePaths.filter((file) => {
      const kernelOrMap = this.kernelMapping.get(file);
      if (!kernelOrMap) {
        return false;
      }
      return kernelOrMap instanceof Kernel
        ? kernelOrMap === kernel
        : kernelOrMap.get(grammar) === kernel;
    });
  }

  dispose() {
    this.subscriptions.dispose();
    // The store outlives deactivation, and `CompositeDisposable#add` is a
    // silent no-op once disposed — without a fresh one every subscription
    // taken after a reactivation (or a hot reload) would be dropped and
    // never released.
    this.subscriptions = new CompositeDisposable();
    this.markersMapping.forEach((markerStore) => markerStore.clear());
    this.markersMapping.clear();
    // Destroy kernels with error handling to prevent one failure from blocking others
    this.runningKernels.forEach((kernel) => {
      try {
        kernel.destroy();
      } catch (e) {
        console.error("[jupyter-repl] Error destroying kernel:", e);
      }
    });
    this.runningKernels = [];
    this.kernelMapping.clear();
  }

  updateEditor(editor) {
    this.editor = editor;
    this.setGrammar(editor);

    if (this.globalMode && this.kernel && editor) {
      const fileName = editor.getPath();
      if (!fileName) {
        return;
      }
      this.kernelMapping.set(fileName, this.kernel);
    }
  }

  // Returns the embedded grammar for multilanguage, normal grammar otherwise
  getEmbeddedGrammar(editor) {
    const grammar = editor.getGrammar();

    if (!isMultilanguageGrammar(grammar)) {
      return grammar;
    }

    const embeddedScope = getEmbeddedScope(editor, editor.getCursorBufferPosition());
    if (!embeddedScope) {
      return grammar;
    }
    const scope = embeddedScope.replace(".embedded", "");
    return atom.grammars.grammarForScopeName(scope);
  }

  setGrammar(editor) {
    if (!editor) {
      this.grammar = null;
      return;
    }

    this.grammar = this.getEmbeddedGrammar(editor);
  }

  setConfigValue(keyPath, newValue) {
    if (!newValue) {
      newValue = atom.config.get(keyPath);
    }

    this.configMapping.set(keyPath, newValue);
  }

  /**
   * Set an external kernel as the current kernel.
   * Used by jupyter-view to make its kernels visible to Variable Explorer, etc.
   * @param {Object|null} kernel - The kernel to set as current, or null to clear
   * @param {Object|null} context - Optional active pane/path context for this kernel
   */
  setExternalKernel(kernel, context = null) {
    this._externalKernel = kernel;
    this._externalKernelContext = context;
  }

  updateActivePaneItem(item) {
    this.activePaneItem = item || null;
  }

  _externalKernelContextMatches() {
    const context = this._externalKernelContext;
    if (!context) return true;

    const activeItem = this.activePaneItem;
    if (context.paneItem && activeItem === context.paneItem) {
      return true;
    }

    const activePath = activeItem?.getPath?.();
    if (context.filePath && activePath === context.filePath) {
      return true;
    }

    if (!this._activePaneItemIsEditor()) {
      return false;
    }

    const editorPath = this.editor?.getPath?.();
    return Boolean(context.filePath && editorPath === context.filePath);
  }

  _activePaneItemIsEditor() {
    const activeItem = this.activePaneItem;
    return Boolean(activeItem && activeItem === this.editor);
  }

  _activePaneItemIsTextEditor() {
    const activeItem = this.activePaneItem;
    return Boolean(activeItem && atom.workspace.isTextEditor(activeItem));
  }

  // Resolve the kernel mapped to the active center pane item by its path. Used
  // for non-editor center items (e.g. a Jupyter notebook) so the status bar
  // reflects that item's kernel instead of the sticky editor's.
  _kernelForActiveItemPath() {
    const path = this.activePaneItem?.getPath?.();
    if (!path) {
      return null;
    }
    const kernelOrMap = this.kernelMapping.get(path);
    if (!kernelOrMap) {
      return null;
    }
    if (kernelOrMap instanceof Kernel) {
      return kernelOrMap;
    }
    return typeof kernelOrMap.values === "function"
      ? kernelOrMap.values().next().value || null
      : null;
  }

  /** Force mobx to recalculate filePath (which depends on editor observable) */
  forceEditorUpdate() {
    const currentEditor = this.editor;
    if (!currentEditor) {
      return;
    }
    const oldKey = this.filePath;
    // Return back if the kernel for this editor is already disposed.
    if (!oldKey || !this.kernelMapping.has(oldKey)) {
      return;
    }
    this.updateEditor(null);
    this.updateEditor(currentEditor);
    const newKey = this.filePath;
    if (!newKey) {
      return;
    }
    // Change key of kernelMapping from editor ID to file path
    this.kernelMapping.set(newKey, this.kernelMapping.get(oldKey));
    this.kernelMapping.delete(oldKey);
  }
}
const store = new Store();
window.jupyter_store = store; // For debugging

module.exports = store;

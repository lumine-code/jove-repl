/** @babel */

import { CompositeDisposable, Disposable } from "atom";

// Labels select which providers serve a watched editor: "workspace-center"
// matches the kernel provider (and any provider without explicit labels),
// "default" matches the editor's built-in word provider.
const WATCH_EDITOR_LABELS = ["default", "workspace-center"];

/**
 * Wires the `autocomplete.watchEditor` service into watch editors, so watch
 * expressions get suggestions from the kernel and the open buffers.
 */
export class AutocompleteWatchEditor {
  constructor() {
    this.watchEditor = null;
    this.disposables = new CompositeDisposable();
    // Panel editors (inspector / data-explorer expressions) -> Disposable|null.
    // A null value marks an editor waiting for the service to arrive.
    this.panelEditors = new Map();
  }

  get isEnabled() {
    return this.watchEditor != null;
  }

  /**
   * Consume the `autocomplete.watchEditor` service.
   *
   * @param {Store} store - The global jupyter store.
   * @param {Function} watchEditor - The service function.
   * @returns {Disposable} - Revokes the service again.
   */
  observe(store, watchEditor) {
    this.watchEditor = watchEditor;

    // Wire up watches that existed before the service arrived.
    for (const kernel of store.runningKernels) {
      const watchesStore = kernel.watchesStore;
      if (!watchesStore) continue;
      for (const watch of watchesStore.watches) {
        if (!watch.autocompleteDisposable) {
          this.addAutocompleteToWatch(watchesStore, watch);
        }
      }
    }

    // Wire up panel editors that existed before the service arrived.
    for (const [editor, disposable] of this.panelEditors) {
      if (!disposable) {
        this.panelEditors.set(editor, this.watchEditor(editor, WATCH_EDITOR_LABELS) ?? null);
      }
    }

    const disposable = new Disposable(() => this.disable(store));
    store.subscriptions.add(disposable);
    return disposable;
  }

  /**
   * Detach autocomplete from all watch editors when the service goes away.
   */
  disable(store) {
    if (!this.isEnabled) return;
    this.watchEditor = null;

    for (const kernel of store.runningKernels) {
      const watchesStore = kernel.watchesStore;
      if (!watchesStore) continue;
      for (const watch of watchesStore.watches) {
        this.removeAutocompleteFromWatch(watchesStore, watch);
      }
    }

    for (const [editor, disposable] of this.panelEditors) {
      if (disposable) {
        disposable.dispose();
        this.panelEditors.set(editor, null);
      }
    }
  }

  /**
   * Keep autocomplete active in an arbitrary panel editor (expression
   * inputs). Effective immediately when the service is present, or as soon
   * as it arrives; cleans up when the editor is destroyed.
   */
  watchPanelEditor(editor) {
    if (!editor || this.panelEditors.has(editor)) return;
    this.panelEditors.set(
      editor,
      this.isEnabled ? (this.watchEditor(editor, WATCH_EDITOR_LABELS) ?? null) : null,
    );
    editor.onDidDestroy(() => {
      this.panelEditors.get(editor)?.dispose();
      this.panelEditors.delete(editor);
    });
  }

  /**
   * Add autocomplete to a specific watch editor.
   */
  addAutocompleteToWatch(watchesStore, watch) {
    if (!this.isEnabled || !watch.editor) return;
    const disposable = this.watchEditor(watch.editor, WATCH_EDITOR_LABELS);
    if (disposable) {
      watch.autocompleteDisposable = disposable;
      watchesStore.autocompleteDisposables?.add(disposable);
    }
  }

  /**
   * Remove autocomplete from a specific watch editor.
   */
  removeAutocompleteFromWatch(watchesStore, watch) {
    const disposable = watch.autocompleteDisposable;
    if (disposable) {
      watchesStore.autocompleteDisposables?.remove(disposable);
      disposable.dispose();
      watch.autocompleteDisposable = null;
    }
  }

  /**
   * Remove and dispose an autocomplete disposable.
   */
  dispose(disposable) {
    if (!disposable) return;
    this.disposables.remove(disposable);
    disposable.dispose();
  }

  /**
   * Track a disposable so it is cleaned up with the consumer.
   */
  register(disposable) {
    this.disposables.add(disposable);
  }
}

const autocompleteConsumer = new AutocompleteWatchEditor();
export default autocompleteConsumer;

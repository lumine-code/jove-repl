const { CompositeDisposable, Emitter } = require("atom");
const WatchStore = require("./watch");
const { autocompleteConsumer: AutocompleteConsumer } = require("../services/consumed/autocomplete");

class WatchesStore {
  watches = [];

  constructor(kernel) {
    this.emitter = new Emitter();
    this.kernel = kernel;
    this.kernel.addWatchCallback(this.run);

    // Setup autocomplete disposables for this watchesStore
    this.autocompleteDisposables = new CompositeDisposable();
    AutocompleteConsumer.register(this.autocompleteDisposables);
    // Start with zero watches - user can add them as needed
  }

  /**
   * Invoke the callback whenever the set of watches changes.
   * @param {Function} callback
   * @returns {Disposable}
   */
  onDidUpdate(callback) {
    return this.emitter.on("did-update", callback);
  }

  createWatch = () => {
    const lastWatch = this.watches[this.watches.length - 1];

    if (!lastWatch || lastWatch.getCode().trim() !== "") {
      const watch = new WatchStore(this.kernel);
      this.watches.push(watch);
      AutocompleteConsumer.addAutocompleteToWatch(this, watch);
      this.emitter.emit("did-update");
      return watch;
    }

    return lastWatch;
  };

  addWatch = () => {
    this.createWatch().focus();
  };

  addWatchFromEditor = (editor) => {
    if (!editor) {
      return;
    }
    const watchText = editor.getSelectedText();

    if (!watchText) {
      this.addWatch();
    } else {
      const watch = this.createWatch();
      watch.setCode(watchText);
      watch.run();
    }
  };

  /**
   * Remove a specific watch by reference
   * @param {WatchStore} watch - The watch to remove
   */
  removeWatchByRef = (watch) => {
    const index = this.watches.indexOf(watch);
    if (index === -1) return;

    // Cleanup autocomplete
    AutocompleteConsumer.removeAutocompleteFromWatch(this, watch);

    // Destroy the watch's editor
    watch.destroy();

    // Remove from array
    this.watches.splice(index, 1);
    this.emitter.emit("did-update");
  };

  removeWatchForEditor = (editor) => {
    const watch = this.watches.find((candidate) => candidate.editor === editor);
    if (!watch) return false;

    this.removeWatchByRef(watch);
    return true;
  };

  run = () => {
    this.watches.forEach((watch) => watch.run());
  };

  destroy() {
    // Destroy all watch editors
    this.watches.forEach((watch) => watch.destroy());
    this.watches = [];

    if (this.autocompleteDisposables) {
      AutocompleteConsumer.dispose(this.autocompleteDisposables);
      this.autocompleteDisposables = null;
    }

    this.emitter.emit("did-update");
  }
}

module.exports = WatchesStore;

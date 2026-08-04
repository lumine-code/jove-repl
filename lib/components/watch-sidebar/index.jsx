const etch = require("@lumine-code/etch");
const { CompositeDisposable } = require("atom");
const Watch = require("./watch");
const { WATCHES_URI } = require("../../utils");
const { renderEmptyMessage } = require("../empty-message");

/** The current kernel's watches, with a button to add another. */
class Watches {
  constructor({ store }) {
    this.store = store;
    this.watchesSubscription = null;

    etch.initialize(this);

    this.disposables = new CompositeDisposable(
      this.store.onDidChangeCurrentKernel(() => this.watchCurrentKernel()),
    );

    this.watchCurrentKernel();
  }

  get watchesStore() {
    return this.store.kernel?.watchesStore || null;
  }

  // Watches belong to a kernel, so the subscription moves with the store's.
  watchCurrentKernel() {
    this.watchesSubscription?.dispose();
    const watchesStore = this.watchesStore;
    this.watchesSubscription = watchesStore
      ? watchesStore.onDidUpdate(() => etch.update(this))
      : null;
    etch.update(this);
  }

  handleRemoveWatch = (watch) => {
    this.watchesStore?.removeWatchByRef(watch);
  };

  render() {
    const watchesStore = this.watchesStore;

    if (!watchesStore) {
      // Without the dock setting the view closes itself rather than sitting
      // there empty; the hide is deferred so it does not run inside a render.
      if (!atom.config.get("jupyter-repl.outputAreaDock")) {
        etch.getScheduler().updateDocument(() => atom.workspace.hide(WATCHES_URI));
      }
      return <div className="sidebar watch-sidebar">{renderEmptyMessage()}</div>;
    }

    return (
      <div className="sidebar watch-sidebar">
        {watchesStore.watches.map((watch) => (
          <Watch key={watch.editor.id} store={watch} onRemove={this.handleRemoveWatch} />
        ))}
        <div className="btn-group">
          <button
            className="btn btn-primary icon icon-plus"
            onClick={() => watchesStore.addWatch()}
          >
            Add watch
          </button>
        </div>
      </div>
    );
  }

  update() {
    return etch.update(this);
  }

  destroy() {
    this.watchesSubscription?.dispose();
    this.disposables.dispose();
    return etch.destroy(this);
  }
}

module.exports = Watches;

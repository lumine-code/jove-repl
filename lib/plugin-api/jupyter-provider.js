const { Disposable } = require("atom");
const store = require("../store");
const { getCurrentCell } = require("../code-manager");

/**
 * The `jupyter.kernel` service: everything another package needs to follow this
 * one's kernels without reaching into its internals.
 *
 * Kernels are handed out as their plugin wrappers, never as the internal
 * objects, so the surface a consumer sees is the one documented in
 * `docs/jupyter.kernel.md`.
 *
 * @class JupyterProvider
 */
class JupyterProvider {
  constructor(emitter) {
    this._emitter = emitter;
  }

  /**
   * Invoke the callback when the kernel of the active editor changes, including
   * to `null`. Does not replay: read `getActiveKernel()` for the current value.
   *
   * @param {Function} callback - Called with the kernel, or null
   * @returns {Disposable}
   */
  onDidChangeKernel(callback) {
    return this._emitter.on("did-change-kernel", (kernel) => {
      callback(kernel ? kernel.getPluginWrapper() : null);
    });
  }

  /**
   * Invoke the callback whenever a kernel starts running.
   * @param {Function} callback - Called with the kernel
   * @returns {Disposable}
   */
  onDidAddKernel(callback) {
    return store.onDidAddKernel((kernel) => callback(kernel.getPluginWrapper()));
  }

  /**
   * Invoke the callback whenever a running kernel goes away.
   * @param {Function} callback - Called with the kernel
   * @returns {Disposable}
   */
  onDidRemoveKernel(callback) {
    return store.onDidRemoveKernel((kernel) => callback(kernel.getPluginWrapper()));
  }

  /**
   * Invoke the callback whenever the set of running kernels changes, or the
   * files any of them is bound to. For consumers that render the whole list.
   * @param {Function} callback
   * @returns {Disposable}
   */
  onDidChangeKernels(callback) {
    return store.onDidChangeKernels(callback);
  }

  /**
   * The kernel of the active editor, or `null` when none is running.
   *
   * This used to throw instead, which contradicted both the documented shape
   * and every reasonable consumer: "is there a kernel yet" is the first thing
   * a panel asks, and the answer is routinely no.
   *
   * @returns {JupyterKernel|null}
   */
  getActiveKernel() {
    return store.kernel ? store.kernel.getPluginWrapper() : null;
  }

  /**
   * Every kernel running in this window, in the order they started.
   * @returns {JupyterKernel[]}
   */
  getRunningKernels() {
    return store.runningKernels.map((kernel) => kernel.getPluginWrapper());
  }

  /**
   * The files a kernel is bound to. A kernel can serve several, and an unsaved
   * editor appears as `Unsaved Editor <id>` rather than a path.
   *
   * @param {JupyterKernel} kernel
   * @returns {String[]}
   */
  getFilesForKernel(kernel) {
    const internal = store.runningKernels.find(
      (candidate) => candidate.getPluginWrapper() === kernel,
    );
    return internal ? store.getFilesForKernel(internal) : [];
  }

  /**
   * The `Range` that `jupyter-repl:run-cell` would run, or `null` with no
   * active text editor.
   * @returns {Range|null}
   */
  getCellRange() {
    if (!store.editor) {
      return null;
    }
    return getCurrentCell(store.editor);
  }

  /**
   * Shut down and release every running kernel. Offered for a consumer that
   * owns the window's lifecycle; a panel should not call it.
   * @returns {Disposable} No-op, so callers can compose it
   */
  shutdownAllKernels() {
    for (const kernel of store.runningKernels.slice()) {
      kernel.shutdown();
      kernel.destroy();
    }
    return new Disposable();
  }
}

module.exports = JupyterProvider;

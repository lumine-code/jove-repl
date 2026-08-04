const store = require("../store");
const { getCurrentCell } = require("../code-manager");
/**
 * @version 1.0.0 The Plugin API allows you to make Jupyter awesome. You will
 *   be able to interact with this class in your Jupyter Plugin using Lumine's
 *   Service API.
 *
 *   Take a look at our [Example
 *   Plugin](https://github.com/lgeiger/jupyter-repl-example-plugin) for learning how
 *   to interact with Jupyter in your own plugin.
 * @class JupyterProvider
 */

class JupyterProvider {
  constructor(emitter) {
    this._emitter = emitter;
  }

  /*
   * Calls your callback when the kernel has changed.
   * @param {Function} Callback
   */
  onDidChangeKernel(callback) {
    this._emitter.on("did-change-kernel", (kernel) => {
      if (kernel) {
        return callback(kernel.getPluginWrapper());
      }

      return callback(null);
    });
  }

  /*
   * Get the `jupyterKernel` of the currently active text editor.
   * @return {Class} `jupyterKernel`
   */
  getActiveKernel() {
    if (!store.kernel) {
      const grammar = store.editor ? store.editor.getGrammar().name : "";
      throw new Error(`No running kernel for grammar \`${grammar}\` found`);
    }

    return store.kernel.getPluginWrapper();
  }

  /*
   * Get the `Range` that will run if `jupyter-repl:run-cell` is called.
   * `null` is returned if no active text editor.
   * @return {Class} `Range`
   */
  getCellRange() {
    if (!store.editor) {
      return null;
    }
    return getCurrentCell(store.editor);
  }
  /*
   *--------
   */
}

module.exports = JupyterProvider;

const { CompositeDisposable, Disposable } = require("atom");

/**
 * Base class for jupyter-repl dock panes.
 * Provides common setup and teardown for the pane's view.
 */
class BasePane {
  element = document.createElement("div");
  disposer = new CompositeDisposable();

  /**
   * @param {Object} config - Pane configuration
   * @param {string} config.title - Pane title
   * @param {string} [config.iconName] - Octicon name for the pane tab
   * @param {string} config.uri - Pane URI
   * @param {string} config.defaultLocation - Default dock location
   * @param {string[]} config.allowedLocations - Allowed dock locations
   * @param {string[]} [config.classNames] - Additional class names
   * @param {Object} [config.component] - Etch component whose element to host
   * @param {HTMLElement} [config.domElement] - DOM element to append
   * @param {Function} [config.onDispose] - Called before dispose
   */
  constructor(config) {
    this.config = config;

    // Add base class and any additional classes
    this.element.classList.add("jupyter-repl");
    if (config.classNames) {
      this.element.classList.add(...config.classNames);
    }

    if (config.component) {
      this.component = config.component;
      this.element.appendChild(this.component.element);
      this.disposer.add(new Disposable(() => this.component.destroy()));
    } else if (config.domElement) {
      this.element.appendChild(config.domElement);
    }
  }

  getTitle = () => this.config.title;
  getIconName = () => this.config.iconName || null;
  getURI = () => this.config.uri;
  getDefaultLocation = () => this.config.defaultLocation;
  getAllowedLocations = () => this.config.allowedLocations;

  destroy() {
    if (this.config.onDispose) {
      this.config.onDispose();
    }
    this.disposer.dispose();
    this.element.remove?.();
  }
}

module.exports = BasePane;

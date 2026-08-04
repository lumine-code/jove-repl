const { Disposable } = require("atom");
const { INSPECTOR_URI } = require("../utils");
const Inspector = require("../components/inspector");
const BasePane = require("./base-pane");
const { inspectorStore } = require("../store/inspector-store");

class InspectorPane extends BasePane {
  constructor() {
    super({
      title: "Inspector",
      iconName: "microscope",
      uri: INSPECTOR_URI,
      defaultLocation: "bottom",
      allowedLocations: ["bottom", "left", "right"],
      classNames: ["inspector"],
      component: new Inspector({ inspectorStore }),
    });

    this.element.tabIndex = -1;
    this.element.addEventListener("focus", this.redirectFocus);
    this.disposer.add(
      new Disposable(() => this.element.removeEventListener("focus", this.redirectFocus)),
      atom.commands.add(this.element, {
        "jupyter-repl:inspector-scroll-up": (event) => this.scroll(event, -1),
        "jupyter-repl:inspector-scroll-down": (event) => this.scroll(event, 1),
      }),
    );
  }

  getFocusTarget() {
    return (
      this.element.querySelector("atom-text-editor.inspector-expression") ||
      (this.element.querySelector(".inspector-result") &&
        this.element.querySelector(".inspector-body")) ||
      this.element.querySelector(".inspector-body") ||
      this.element
    );
  }

  redirectFocus = (event) => {
    if (event.target !== this.element) {
      return;
    }
    const target = this.getFocusTarget();
    if (target !== this.element) {
      requestAnimationFrame(() => target.focus?.({ preventScroll: true }));
    }
  };

  focus = () => {
    this.getFocusTarget().focus?.({ preventScroll: true });
  };

  scroll(event, direction) {
    event?.stopPropagation?.();
    const target = this.element.querySelector(".inspector-body") || this.element;
    const lineHeight = parseFloat(getComputedStyle(target).lineHeight) || 20;
    target.scrollTop += direction * lineHeight * 3;
  }
}

module.exports = InspectorPane;

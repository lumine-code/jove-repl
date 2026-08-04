const { Disposable } = require("atom");
const { KERNEL_MONITOR_URI } = require("../utils");
const KernelMonitor = require("../components/kernel-monitor");
const BasePane = require("./base-pane");

class KernelMonitorPane extends BasePane {
  constructor(store) {
    super({
      title: "Kernel Monitor",
      iconName: "pulse",
      uri: KERNEL_MONITOR_URI,
      defaultLocation: "bottom",
      allowedLocations: ["bottom", "left", "right"],
      classNames: ["kernel-monitor"],
      component: new KernelMonitor({ store }),
    });

    this.element.tabIndex = -1;
    this.element.addEventListener("focus", this.redirectFocus);
    this.disposer.add(
      new Disposable(() => this.element.removeEventListener("focus", this.redirectFocus)),
    );
  }

  getFocusTarget() {
    return this.element.querySelector(".kernel-monitor-wrapper") || this.element;
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
}

module.exports = KernelMonitorPane;

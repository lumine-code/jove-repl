const etch = require("@lumine-code/etch");
const KernelMonitor = require("../lib/components/kernel-monitor");

// The table used to re-render through mobx observation of runningKernels and of
// each kernel's state. It now listens to the store's kernel-set event and
// subscribes to every running kernel's status event, so these specs pin that
// wiring as well as the selection rules, which no spec covered before.

const flush = (component) => etch.updateSync(component);

function fakeKernel(displayName, overrides = {}) {
  const listeners = [];
  return {
    id: `kernel-${displayName}`,
    displayName,
    executionState: "idle",
    executionCount: 0,
    lastExecutionTime: "No execution",
    kernelSpec: { display_name: displayName },
    transport: {},
    interrupt() {
      this.interrupted = true;
    },
    restart() {
      this.restarted = true;
    },
    shutdown() {
      this.shutDown = true;
    },
    destroy() {
      this.destroyed = true;
    },
    onDidChangeStatus(callback) {
      listeners.push(callback);
      return {
        dispose() {
          const index = listeners.indexOf(callback);
          if (index > -1) listeners.splice(index, 1);
        },
      };
    },
    emitStatus() {
      listeners.slice().forEach((callback) => callback());
    },
    listenerCount: () => listeners.length,
    ...overrides,
  };
}

function fakeStore(kernels, files = new Map()) {
  const kernelSetCallbacks = [];
  return {
    runningKernels: kernels,
    kernel: kernels[0] || null,
    getFilesForKernel: (kernel) => files.get(kernel) || [],
    onDidChangeCurrentKernel: () => ({ dispose() {} }),
    onDidChangeKernels(callback) {
      kernelSetCallbacks.push(callback);
      return { dispose() {} };
    },
    setKernels(next) {
      this.runningKernels = next;
      this.kernel = next[0] || null;
      kernelSetCallbacks.slice().forEach((callback) => callback());
    },
  };
}

describe("kernel monitor", () => {
  let component;

  afterEach(() => {
    component?.destroy();
    component = null;
  });

  const rows = () => [...component.element.querySelectorAll(".kernel-monitor-row")];

  it("renders one row per running kernel", () => {
    component = new KernelMonitor({ store: fakeStore([fakeKernel("Python 3"), fakeKernel("R")]) });
    flush(component);

    expect(rows().length).toBe(2);
    expect(rows()[0].querySelector(".kernel-monitor-kernel").textContent).toBe("Python 3");
    expect(rows()[1].querySelector(".kernel-monitor-kernel").textContent).toBe("R");
  });

  it("highlights the store's current kernel until one is picked by hand", () => {
    const python = fakeKernel("Python 3");
    const r = fakeKernel("R");
    const store = fakeStore([python, r]);
    store.kernel = r;
    component = new KernelMonitor({ store });
    flush(component);

    expect(rows()[1].classList.contains("selected")).toBe(true);

    component.move(-1);
    flush(component);

    expect(rows()[0].classList.contains("selected")).toBe(true);
  });

  it("keeps the arrow-key selection inside the list", () => {
    const store = fakeStore([fakeKernel("Python 3"), fakeKernel("R")]);
    component = new KernelMonitor({ store });
    flush(component);

    component.move(-5);
    flush(component);
    expect(rows()[0].classList.contains("selected")).toBe(true);

    component.move(5);
    flush(component);
    expect(rows()[1].classList.contains("selected")).toBe(true);
  });

  it("runs an action against the highlighted kernel", () => {
    const python = fakeKernel("Python 3");
    const r = fakeKernel("R");
    component = new KernelMonitor({ store: fakeStore([python, r]) });
    flush(component);

    component.move(1);
    component.act((kernel) => kernel.interrupt());

    expect(r.interrupted).toBe(true);
    expect(python.interrupted).toBeUndefined();
  });

  it("redraws when a kernel reports a status change", () => {
    const python = fakeKernel("Python 3");
    component = new KernelMonitor({ store: fakeStore([python]) });
    flush(component);
    expect(rows()[0].querySelector(".kernel-monitor-status").textContent).toBe("idle");

    python.executionState = "busy";
    python.emitStatus();
    flush(component);

    expect(rows()[0].querySelector(".kernel-monitor-status").textContent).toBe("busy");
  });

  it("re-subscribes when the set of kernels changes", () => {
    const python = fakeKernel("Python 3");
    const r = fakeKernel("R");
    const store = fakeStore([python]);
    component = new KernelMonitor({ store });
    flush(component);
    expect(python.listenerCount()).toBe(1);

    store.setKernels([r]);
    flush(component);

    expect(rows().length).toBe(1);
    expect(python.listenerCount()).toBe(0);
    expect(r.listenerCount()).toBe(1);
  });

  it("lists the files each kernel is bound to", () => {
    const python = fakeKernel("Python 3");
    const files = new Map([[python, ["Unsaved Editor 7"]]]);
    component = new KernelMonitor({ store: fakeStore([python], files) });
    flush(component);

    expect(rows()[0].querySelector(".kernel-monitor-files").textContent).toContain(
      "Unsaved Editor 7",
    );
  });

  it("drops every kernel subscription when destroyed", () => {
    const python = fakeKernel("Python 3");
    component = new KernelMonitor({ store: fakeStore([python]) });
    flush(component);
    expect(python.listenerCount()).toBe(1);

    component.destroy();
    component = null;

    expect(python.listenerCount()).toBe(0);
  });
});

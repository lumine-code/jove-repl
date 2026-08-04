/** @babel */

// The panels are being moved off mobx observation onto these events, and later
// into their own packages, where mobx observables cannot cross the boundary.
// These specs pin the event contract itself, independent of mobx.

import KernelTransport from "../lib/kernel-transport";
import OutputStore from "../lib/store/output";
import inspectorStore from "../lib/store/inspector-store";
import dataExplorerStore from "../lib/store/data-explorer-store";

function kernelSpec(language = "python") {
  return { language, display_name: `${language} kernel` };
}

describe("kernel transport status events", () => {
  let transport;

  beforeEach(() => {
    transport = new KernelTransport(kernelSpec(), { name: "Python", scopeName: "source.python" });
  });

  afterEach(() => {
    transport.destroy();
  });

  it("emits on execution state changes", () => {
    const calls = [];
    transport.onDidChangeStatus(() => calls.push(transport.executionState));

    transport.setExecutionState("busy");
    transport.setExecutionState("idle");

    expect(calls).toEqual(["busy", "idle"]);
  });

  it("emits on count and timing changes the status bar reads", () => {
    let calls = 0;
    transport.onDidChangeStatus(() => calls++);

    transport.setExecutionCount(3);
    transport.setLastExecutionTime("1.000 sec");
    transport.setExecutionStartTime(1234);

    expect(calls).toBe(3);
    expect(transport.executionCount).toBe(3);
    expect(transport.lastExecutionTime).toBe("1.000 sec");
    expect(transport.executionStartTime).toBe(1234);
  });

  it("stops emitting once destroyed and still hands back a disposable", () => {
    let calls = 0;
    transport.destroy();

    const subscription = transport.onDidChangeStatus(() => calls++);
    expect(typeof subscription.dispose).toBe("function");

    transport.setExecutionCount(9);
    expect(calls).toBe(0);

    subscription.dispose();
  });
});

describe("output store events", () => {
  let store;

  beforeEach(() => {
    store = new OutputStore();
  });

  it("emits when output arrives", () => {
    let calls = 0;
    const subscription = store.onDidUpdate(() => calls++);

    store.appendOutput({ output_type: "stream", name: "stdout", text: "hi" });

    expect(calls).toBeGreaterThan(0);
    expect(store.outputs.length).toBe(1);
    subscription.dispose();
  });

  it("emits when cleared and when the history index moves", () => {
    store.appendOutput({ output_type: "stream", name: "stdout", text: "a" });
    store.startNewRun();
    store.appendOutput({ output_type: "stream", name: "stdout", text: "b" });

    let calls = 0;
    const subscription = store.onDidUpdate(() => calls++);

    store.decrementIndex();
    expect(calls).toBe(1);

    store.clear();
    expect(calls).toBe(2);
    expect(store.outputs).toEqual([]);

    subscription.dispose();
  });

  it("stops emitting to a disposed subscriber", () => {
    let calls = 0;
    const subscription = store.onDidUpdate(() => calls++);
    subscription.dispose();

    store.appendOutput({ output_type: "stream", name: "stdout", text: "hi" });

    expect(calls).toBe(0);
  });
});

describe("panel store events", () => {
  afterEach(() => {
    inspectorStore.reset();
    dataExplorerStore.reset();
  });

  it("emits from the inspector store on error and reset", () => {
    let calls = 0;
    const subscription = inspectorStore.onDidUpdate(() => calls++);

    inspectorStore.setError("boom");
    expect(inspectorStore.error).toBe("boom");
    expect(calls).toBe(1);

    inspectorStore.reset();
    expect(inspectorStore.error).toBe(null);
    expect(calls).toBe(2);

    subscription.dispose();
  });

  it("emits from the data explorer store on view configuration changes", () => {
    let calls = 0;
    const subscription = dataExplorerStore.onDidUpdate(() => calls++);

    dataExplorerStore.setViewMode("line");
    dataExplorerStore.setSelectedRow(2);

    expect(dataExplorerStore.viewMode).toBe("line");
    expect(dataExplorerStore.selectedRow).toBe(2);
    expect(calls).toBe(2);

    subscription.dispose();
  });
});

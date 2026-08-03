/** @babel */

import { runInAction } from "mobx";

// A window reload never deactivates packages, so `deactivate()` is not enough
// to release the kernels' zmq sockets. Left open, they make zeromq run
// callbacks into an environment that is already tearing down, and libzmq
// aborts the renderer — the user sees "The editor has crashed" whenever they
// restart with a kernel still running.
describe("teardown with a running kernel", () => {
  let store;

  beforeEach(async () => {
    store = require("../lib/store").default;
    // The package activates on its commands, so dispatch one to trigger it.
    const activation = atom.packages.activatePackage("jupyter-repl");
    atom.commands.dispatch(atom.views.getView(atom.workspace), "jupyter-repl:debug-toggle");
    await activation;
  });

  afterEach(async () => {
    runInAction(() => {
      store.runningKernels = [];
    });
    await atom.packages.deactivatePackage("jupyter-repl");
  });

  // `grammar` is what the package's editor-class autorun reads off a running
  // kernel; without it the store's own reaction throws before the assertion.
  function fakeKernel() {
    const kernel = { destroyed: 0, grammar: { name: "Python" } };
    kernel.destroy = () => kernel.destroyed++;
    return kernel;
  }

  it("destroys running kernels when the window goes away", () => {
    const kernel = fakeKernel();
    runInAction(() => store.runningKernels.push(kernel));

    atom.emitter.emit("will-destroy");

    expect(kernel.destroyed).toBe(1);
  });

  it("destroys every kernel even when one throws", () => {
    const thrower = {
      grammar: { name: "Python" },
      destroy() {
        throw new Error("boom");
      },
    };
    const survivor = fakeKernel();
    runInAction(() => store.runningKernels.push(thrower, survivor));
    spyOn(console, "error");

    atom.emitter.emit("will-destroy");

    expect(survivor.destroyed).toBe(1);
  });
});

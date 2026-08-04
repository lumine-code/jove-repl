// Kernel discovery and launching moved out of the abandoned `kernelspecs` and
// `spawnteract` packages and into this package's own lib/. Nothing else in the
// suite loads the two modules that consume them, so these specs exist to catch
// a broken import path — the one way that migration could fail silently until
// a user tries to start a kernel.
describe("kernel module wiring", () => {
  it("loads the kernel manager against the local kernelspecs module", () => {
    const { KernelManager } = require("../lib/kernel-manager");
    expect(typeof KernelManager).toBe("function");
    expect(typeof new KernelManager().update).toBe("function");
  });

  it("loads the ZMQ kernel transport against the local launcher", () => {
    const ZMQKernel = require("../lib/zmq-kernel");
    expect(typeof ZMQKernel).toBe("function");
  });

  it("exposes the launcher functions the transport imports by name", () => {
    const launcher = require("../lib/kernel-launcher");
    expect(typeof launcher.launchSpec).toBe("function");
    expect(typeof launcher.launchSpecFromConnectionInfo).toBe("function");
  });
});

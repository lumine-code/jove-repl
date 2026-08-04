const path = require("path");
const manifest = require(path.join(__dirname, "..", "package.json"));
const main = require(path.join(__dirname, "..", manifest.main));

// A service whose method has been renamed away is not an error anywhere: the
// editor logs a warning nobody reads and the other side simply never connects.
// Every panel that left this package depends on `jupyter.kernel`, so a typo
// here breaks four packages silently.

describe("the services this package declares", () => {
  it("exposes a method for each one", () => {
    const declared = [
      ...Object.values(manifest.providedServices || {}),
      ...Object.values(manifest.consumedServices || {}),
    ].flatMap((service) => Object.values(service.versions));

    expect(declared.length).toBeGreaterThan(0);
    for (const method of declared) {
      expect(typeof main[method]).toBe("function");
    }
  });

  it("still provides the kernel hub the extracted panels consume", () => {
    expect(manifest.providedServices["jupyter.kernel"].versions["1.0.0"]).toBe(
      "provideJupyterKernel",
    );
  });

  // Deferring is right here, unlike in a package whose services are what
  // another package opens it with: nothing this one provides means anything
  // before a kernel exists, and a kernel only exists once one of these ran.
  it("may defer activation, because a kernel is what makes its services useful", () => {
    expect(Object.values(manifest.activationCommands).flat()).toContain(
      "jupyter-repl:start-local-kernel",
    );
  });
});

# jupyter.kernel

Reads the running Jupyter kernel: which one is active, when that changes, and the range of the cell at the cursor.

|             |                                                               |
| ----------- | ------------------------------------------------------------- |
| Version     | `1.0.0`                                                       |
| Provided by | `provideJupyterKernel()` returning the kernel provider        |
| Consumed by | `consumeJupyterKernel(kernel)`                                |
| Owner       | [`jupyter-repl`](https://github.com/lumine-code/jupyter-repl) |

**No package consumes this today.** It is the extension point for anything that wants to follow the REPL's kernel — a status indicator, a variable inspector, a package that runs its own code against the same session.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "jupyter.kernel": {
      "versions": { "^1.0.0": "consumeJupyterKernel" }
    }
  }
}
```

## Contract

```ts
type JupyterKernel = {
  getActiveKernel(): Kernel | null;
  onDidChangeKernel(callback: (kernel: Kernel | null) => void): Disposable;
  getCellRange(): Range | null;
};
```

| Member                        | Description                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `getActiveKernel()`           | The kernel for the active editor, or `null` when none is running.               |
| `onDidChangeKernel(callback)` | Fires when the active kernel changes, including to `null`.                      |
| `getCellRange()`              | The buffer range of the cell containing the cursor, or `null` outside any cell. |

## Minimal example

```js
const { CompositeDisposable, Disposable } = require("atom");

module.exports = {
  consumeJupyterKernel(kernel) {
    this.kernel = kernel;
    const disposables = new CompositeDisposable();
    this.render(kernel.getActiveKernel());
    disposables.add(
      kernel.onDidChangeKernel((active) => this.render(active)),
      new Disposable(() => {
        this.kernel = null;
        this.render(null);
      }),
    );
    return disposables;
  },
};
```

## Behavior

The provider is **created lazily on first request** — the kernel plugin API is not loaded until something asks for it — so consuming the service has a small one-off cost and no effect on startup.

`getActiveKernel()` is scoped to the active editor, not to the window. Switching tabs can change the answer without any kernel starting or stopping.

`onDidChangeKernel` does not replay on subscribe. Read `getActiveKernel()` for the initial state, as the example does.

`getCellRange()` reads from the cell markers the REPL maintains, so it answers `null` when cell markers are switched off in the settings even though the file has cells.

## Teardown

Return a `Disposable` that unsubscribes and drops your reference. The kernel belongs to `jupyter-repl` — do not shut it down; the user may still be using it.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.

# jupyter.breakpoints

Reports where the cell boundaries are in an editor, so another package can draw or reason about them.

|             |                                                               |
| ----------- | ------------------------------------------------------------- |
| Version     | `1.0.0`                                                       |
| Provided by | `provideJupyterBreakpoints()` returning the query object      |
| Consumed by | `consumeJupyterBreakpoints(breakpoints)`                      |
| Owner       | [`jupyter-repl`](https://github.com/lumine-code/jupyter-repl) |

"Breakpoint" here means a **cell boundary** in a script — the `# %%` markers that divide a plain source file into runnable chunks — not a debugger breakpoint. The scrollbar overview is the existing consumer.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "jupyter.breakpoints": {
      "versions": { "^1.0.0": "consumeJupyterBreakpoints" }
    }
  }
}
```

## Contract

```ts
type JupyterBreakpoints = {
  getBreakpoints(editor: TextEditor): Point[];
  initBreakpoints(editor: TextEditor): Point[];
  onDidUpdate(callback: () => void): Disposable;
};
```

| Member                    | Description                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `getBreakpoints(editor)`  | The cell boundaries as buffer positions. `[]` for an editor with none, or with no buffer. |
| `initBreakpoints(editor)` | The same, but returns `[]` when the user has cell markers switched off. **Use this one.** |
| `onDidUpdate(callback)`   | Fires when the boundaries may have changed. Carries no payload.                           |

## Minimal example

```js
module.exports = {
  consumeJupyterBreakpoints(breakpoints) {
    this.breakpoints = breakpoints;
    return breakpoints.onDidUpdate(() => this.redraw());
  },

  rowsFor(editor) {
    return (this.breakpoints?.initBreakpoints(editor) ?? []).map((point) => point.row);
  },
};
```

## Behavior

**Prefer `initBreakpoints` over `getBreakpoints`.** They return the same positions, but `initBreakpoints` respects the `jupyter-repl.cellMarkers` setting and returns `[]` when the user has turned cell markers off. Using `getBreakpoints` directly draws markers the user asked not to see.

The **end-of-file boundary is excluded**. Cells are delimited internally by a list that includes the buffer's end; the service trims it, so the positions you get are real dividers, not the final terminator. A file with three cells yields two boundaries.

`onDidUpdate` says only that something _may_ have changed — re-query rather than diffing. It does not replay on subscribe.

An editor with no buffer, or none at all, yields `[]` rather than throwing.

## Teardown

`onDidUpdate` returns a `Disposable`; return it from your consumer method, and clear whatever you drew.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.

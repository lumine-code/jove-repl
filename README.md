# hydrogen

Run code interactively with Jupyter kernels. Supports Python, R, JavaScript, and other languages with rich output including plots, images, HTML, and LaTeX.

## Features

- **Interactive execution**: run lines, selections, or automatically detected code blocks with inline results, multiple cursors, and smart Python/bracket/fold detection.
- **Rich media output**: renders plots, images, video, HTML, LaTeX, and interactive Plotly and Vega charts inline.
- **Kernel intelligence**: autocomplete, object introspection, and a shared namespace with one kernel per language across files.
- **Watches and variables**: auto-runs watch expressions and browses kernel variables in dedicated panels.
- **Data explorer**: inspects dataframes, arrays, and nested objects in a searchable grid with charts, drill-down, and breadcrumb navigation.
- **Kernel management**: starts local kernels, connects to remote gateways, and monitors or controls kernels from the kernel monitor.
- **Notebook support**: imports and exports `.ipynb` notebooks and drives external notebook cells through the `hydrogen-adapter` service.
- **Jupyter console**: attaches a console to the active kernel in an embedded terminal, a system terminal, or via a copied command.
- **Extensible services**: provides and consumes services for autocomplete, data-explorer search, breakpoints, and third-party integrations.

## Installation

To install `hydrogen`, clone this repository into your Lumine packages directory (`~/.lumine/packages/hydrogen`) and restart Lumine. If it is listed in your configured package sources, it can also be installed from the Install pane of the Lumine settings.

## Commands

Commands available in `atom-text-editor:not([mini])`:

- `hydrogen:run`: run code at cursor,
- `hydrogen:run-and-move-down`: run and move to next block,
- `hydrogen:run-cell`: run current cell,
- `hydrogen:run-cell-and-move-down`: run cell and move to next,
- `hydrogen:run-all`: run all code in editor,
- `hydrogen:run-all-above`: run all code above cursor,
- `hydrogen:run-all-inline`: run all code inline, one statement at a time,
- `hydrogen:run-all-above-inline`: run all code above cursor inline,
- `hydrogen:run-all-below-inline`: run all code below cursor inline,
- `hydrogen:recalculate-all`: clear results, restart kernel, run all,
- `hydrogen:recalculate-all-above`: clear results, restart kernel, run all above,
- `hydrogen:recalculate-all-inline`: clear results, restart kernel, run all inline,
- `hydrogen:recalculate-all-above-inline`: clear results, restart kernel, run all above inline,
- `hydrogen:clear-results`: clear output results,
- `hydrogen:clear-and-restart`: clear results and restart kernel,
- `hydrogen:clear-and-center`: clear results and center cursor,
- `hydrogen:toggle-output-area`: toggle output area mode,
- `hydrogen:start-local-kernel`: start a local kernel,
- `hydrogen:connect-to-remote-kernel`: connect to a remote kernel via gateway,
- `hydrogen:connect-to-existing-kernel`: connect to an existing kernel,
- `hydrogen:interrupt-kernel`: interrupt running execution,
- `hydrogen:restart-kernel`: restart the kernel,
- `hydrogen:shutdown-kernel`: shutdown the kernel,
- `hydrogen:rename-remote-session`: rename remote session,
- `hydrogen:disconnect-remote-session`: disconnect remote session,
- `hydrogen:update-kernels`: refresh available kernels list,
- `hydrogen:add-watch`: add watch expression,
- `hydrogen:remove-watch`: remove focused watch expression when focus is in a watch editor,
- `hydrogen:toggle-watches`: toggle watches panel,
- `hydrogen:toggle-variable-explorer`: toggle variables panel,
- `hydrogen:open-data-explorer`: load the selected expression (or word under cursor) into the data explorer,
- `hydrogen:go-to-next-cell`: jump to next cell,
- `hydrogen:go-to-previous-cell`: jump to previous cell,
- `hydrogen:select-cell`: select current cell,
- `hydrogen:select-previous-cell`: extend cell selection up,
- `hydrogen:select-next-cell`: extend cell selection down,
- `hydrogen:move-cell-up`: move cell up,
- `hydrogen:move-cell-down`: move cell down,
- `hydrogen:fold-current-cell`: fold current cell,
- `hydrogen:fold-all-but-current-cell`: fold all cells except current,
- `hydrogen:export-notebook`: export editor content to `.ipynb`.

Commands available in `atom-workspace`:

- `hydrogen:import-notebook`: import a `.ipynb` notebook,
- `hydrogen:open-examples`: open example files,
- `hydrogen:open-gateways`: open `gateways.json`,
- `hydrogen:shutdown-all-kernels`: shutdown all running kernels,
- `hydrogen:toggle-kernel-monitor-focus`: toggle focus to the kernel monitor panel (returns focus to the editor when already focused). The highlighted row follows the kernel of the active editor; navigate with <kbd>up</kbd> / <kbd>down</kbd>, open the selected kernel's files with <kbd>Enter</kbd>, and act on it with <kbd>i</kbd> (interrupt), <kbd>r</kbd> (restart), <kbd>s</kbd> (shutdown),
- `hydrogen:toggle-exec-panel`: toggle exec panel,
- `hydrogen:toggle-inspector-focus`: show inspector pane,
- `hydrogen:inspect-under-cursor`: inspect the expression under the cursor without moving focus from the editor,
- `hydrogen:attach-to-claude`: attach code and output to claude-chat,
- `hydrogen:debug-toggle`: toggle debug logging,
- `hydrogen:open-jupyter-console`: open Jupyter console attached to active kernel in an embedded terminal pane,
- `hydrogen:spawn-jupyter-console`: spawn Jupyter console attached to active kernel in a system terminal,
- `hydrogen:copy-jupyter-console-command`: copy the Jupyter console command to clipboard.

## Provided Service `search-adapter`

Allows the search-panel package to search the active Data Explorer pane through the normal buffer find workflow:

- `search-panel:show`, `search-panel:find-next`, and `search-panel:find-previous` search the visible Data Explorer grid instead of the active text editor while the Data Explorer pane is active.
- Matching cells are highlighted in the canvas grid. The current match uses a stronger highlight and is scrolled into view.
- Search respects the shared find options, including regex, case sensitivity, and whole-word matching.
- Data Explorer is read-only, so replace commands are disabled for this pane.
- Drill-down, breadcrumb navigation, refresh, errors, and reset refresh the search result list so stale cell matches are cleared.

This service is provided as `search-adapter@1.0.0` through `provideSearchAdapter`.

## Editor kernel class

While a file has a running kernel, hydrogen adds the `hydrogen-kernel` class to its `atom-text-editor` element. The class is added when the kernel starts, removed when it shuts down, and follows the file when it is saved or reopened. This lets you scope keymaps and styles to editors that actually have a live kernel.

For example, bind <kbd>Ctrl+Enter</kbd> to run code only when a kernel is running, in your `keymap.json`:

```json
{
  "atom-text-editor.hydrogen-kernel:not([mini])": {
    "ctrl-enter": "hydrogen:run"
  }
}
```

Or highlight such editors in your `styles.css`:

```css
atom-text-editor.hydrogen-kernel {
  border-left: 2px solid limegreen;
}
```

## Kernel installation

hydrogen requires Jupyter kernels to be installed on your system. A kernel is a language-specific backend that executes your code. You can install kernels for many languages. See the [full list of available kernels](https://github.com/jupyter/jupyter/wiki/Jupyter-kernels) on the Jupyter wiki.

### Python (IPython)

Python is the most common kernel. Install it with:

```bash
pip install ipykernel
python -m ipykernel install --user
```

To register a kernel from a **virtual environment**, activate it first and install with a display name:

```bash
source myenv/bin/activate        # Linux/macOS
myenv\Scripts\activate           # Windows
pip install ipykernel
python -m ipykernel install --user --name myenv --display-name "Python (myenv)"
```

The `--name` flag sets the kernel directory name (used in [magic comments](#kernel-selection)), and `--display-name` sets the label shown in the kernel picker. Once registered, the kernel remains available even when the venv is not activated, as it points directly to the venv's Python interpreter.

To remove a kernel you no longer need:

```bash
jupyter kernelspec uninstall myenv
```

See the [IPython kernel documentation](https://ipython.readthedocs.io/en/stable/install/kernel_install.html) for more details.

### R (IRkernel)

Install the IRkernel package from R and register it with Jupyter:

```bash
R -e "install.packages('IRkernel'); IRkernel::installspec()"
```

See the [IRkernel documentation](https://irkernel.github.io/installation/) for more details.

### JavaScript / TypeScript

Several JavaScript runtimes provide Jupyter kernels. For **IJavascript**:

```bash
npm install -g ijavascript
ijsinstall
```

For **Deno**, the kernel is built-in:

```bash
deno jupyter --install
```

### Julia (IJulia)

Install the IJulia package from the Julia REPL:

```julia
using Pkg; Pkg.add("IJulia")
```

### Verifying installation

To list all installed kernels:

```bash
jupyter kernelspec list
```

For general information on installing and managing kernels, see the [Jupyter documentation](https://docs.jupyter.org/en/latest/install/kernels.html).

## Kernel selection

When multiple kernels are available for a language, you can specify which kernel to use with a magic comment `<comment>:: kernelname` on the first line. The comment character is automatically detected based on the language:

```python
#:: python3
import numpy as np
```

```javascript
//:: deno
console.log("Hello from Deno");
```

Matching rules:

- **Case-sensitive**: Must match exactly (e.g., `python3` not `Python3`)
- **Kernel name**: The directory name from `jupyter kernelspec list` (e.g., `python3`)
- **Display name**: The human-readable name (e.g., `Python 3.13`)

If no match is found, falls back to normal behavior (picker or auto-select).

In the kernel picker, press **Ctrl+Enter** to insert the selected kernel as a magic comment instead of starting it.

## Kernel gateways

Connect to remote or local Jupyter servers by configuring kernel gateways in `<config-dir>/gateways.json`.
Use the `Hydrogen: Open Gateways Config` command (`hydrogen:open-gateways`) to open this file in Lumine.

If `gateways.json` does not exist yet, hydrogen creates it automatically the first time it is opened or used.

Example of local jupyter server:

The `jupyter-server` package is required. Install it in the environment you want to use for the server:

```bash
pip install jupyter-server
```

```bash
jupyter server --IdentityProvider.token='test123'
```

In `gateways.json`, add gateway entries as an array:

```json
[
  {
    "name": "Local Jupyter",
    "options": {
      "baseUrl": "http://localhost:8888",
      "token": "test123"
    }
  }
]
```

Use the `Hydrogen: Connect to Remote Kernel` command (`hydrogen:connect-to-remote-kernel`) to select a gateway and kernel.

If `token` is configured, hydrogen uses it automatically and does not prompt for authentication. Without a configured token, after selecting a gateway you'll be prompted to choose an authentication method:

- **No credentials**: for servers without authentication
- **Authenticate with a token**: prompts for the server token
- **Authenticate with a cookie**: prompts for a cookie value

If your server was started without a token, omit `token` and choose **No credentials** when prompted:

```json
[
  {
    "name": "Local Jupyter",
    "options": {
      "baseUrl": "http://localhost:8888"
    }
  }
]
```

## Code block detection

When you run code without a selection, hydrogen intelligently detects what to execute based on cursor position.

### Priority order

1. **Selection** - If text is selected, execute exactly that
2. **Language Specials** - Python compound statements (see below)
3. **Brackets** - Multi-line bracket expressions `()`, `[]`, `{}`
4. **Folds** - Foldable language constructs
5. **Single Line** - Current line as fallback

### Python support

| Cursor Position                  | What Gets Executed                      |
| -------------------------------- | --------------------------------------- |
| On `def`/`class` line            | Entire function/class (with decorators) |
| On `@decorator` line             | Decorated function/class                |
| On `if`/`elif`/`else` line       | Entire if-elif-else chain               |
| On `try`/`except`/`finally` line | Entire try block                        |
| On `for`/`while` line            | Loop with optional `else`               |
| On `with`/`match` line           | Entire block                            |
| **Inside body**                  | **Single line only**                    |

### Bracket expressions

| Cursor Position                     | What Gets Executed   |
| ----------------------------------- | -------------------- |
| On line ending with `[`, `(`, `{`   | Entire bracket block |
| On line starting with `]`, `)`, `}` | Entire bracket block |
| **Inside bracket block**            | **Single line only** |

### Examples

```python
# Cursor on "if" → executes entire if-elif-else
if x > 0:
    print("positive")
elif x < 0:
    print("negative")
else:
    print("zero")

# Cursor on "print" inside body → executes only that line
if x > 0:
    print("positive")  # ← cursor here = single line

# Cursor on "[" → executes entire list
data = [
    1,
    2,
    3,
]

# Cursor on "2," inside list → executes only "2,"
data = [
    1,
    2,  # ← cursor here = single line
    3,
]
```

This allows you to execute entire blocks from control lines, while still being able to inspect individual lines inside bodies.

## Output interactions

Click on output results to interact with them:

| Action                              | Effect                                       |
| ----------------------------------- | -------------------------------------------- |
| **Click**                           | Copy to clipboard (image or text)            |
| **Ctrl+Click** (Cmd+Click on macOS) | Open in editor (images open in image-editor) |

Images opened via Ctrl+Click are displayed in the image-editor package with full editing capabilities (zoom, pan, filters, save-as).

## Jupyter console launcher

Attach a standalone Jupyter console to the active kernel via its connection file. The same kernel that runs your inline code is reused, so variables and state are shared between the console and the editor.

Three commands are available:

- `hydrogen:open-jupyter-console`: runs the console in an embedded [terminal](https://github.com/lumine-code/terminal) pane inside Lumine (requires the `terminal` package),
- `hydrogen:spawn-jupyter-console`: opens the system terminal and runs the console there (requires the terminal-spawn package),
- `hydrogen:copy-jupyter-console-command`: copies the resolved command to the clipboard so you can paste it anywhere (e.g. an SSH session).

Only local kernels are supported (remote kernels have no connection file).

The command template is configurable via the `Jupyter console command` setting. Two placeholders are available: `{python}` for the active kernel's Python interpreter and `{connection-file}` for the kernel's connection file path. Using `{python}` runs the console through the kernel's own interpreter, so the conda/venv environment does not need to be activated in the terminal first. Examples:

- `"{python}" -m jupyter_console --existing {connection-file}` (default),
- `"{python}" -m qtconsole --existing {connection-file}`,
- `jupyter console --existing {connection-file}` (uses `jupyter` from the terminal's PATH),
- `ssh remote 'jupyter console --existing {connection-file}'`.

## Consumed Service `hydrogen-adapter`

Allows non-TextEditor pane items, such as notebooks from the jupyter-next package, to be executed through hydrogen commands. The adapter owns target enumeration, source retrieval, output persistence, and focus/navigation inside the external pane item.

External packages provide this service in `package.json`:

```json
{
  "providedServices": {
    "hydrogen-adapter": {
      "versions": {
        "1.0.0": "provideHydrogenAdapter"
      }
    }
  }
}
```

In the provider package's main module:

```javascript
module.exports = {
  provideHydrogenAdapter() {
    return {
      getActiveAdapter() {
        return this.getAdapterForItem(atom.workspace.getActivePaneItem());
      },

      getAdapterForItem(item) {
        return item && item.getHydrogenAdapter ? item.getHydrogenAdapter() : null;
      },
    };
  },
};
```

The service object must expose `getActiveAdapter()` or `handlesItem(item)` plus `getAdapterForItem(item)`. The active adapter should expose:

- Required identity/context methods: `getPaneItem()`, `getPath()`, `getTitle()`. Unsaved or virtual adapters may also expose `getAdapterId()` for a stable non-path key.
- Required target methods: `getRunTargets(scope)`, `getRunTarget(id)`, `getActiveTargetId()`.
- Each target should include `{ id, editor, grammar, source, row, type, executable }`. `executable: false`, `type: "markdown"`, and `type: "raw"` targets are skipped without starting kernel execution.
- Optional kernel methods: `getKernelTarget(id)`, `getMetadata()`, `setKernelSpec(spec)`.
- Optional navigation methods: `setActiveTargetId(id)`, `getNextRunTarget(target)`, `focusTarget(target)`.
- Optional output methods: `clearTargetOutputs(target)`, `appendTargetOutput(target, output)`, `setTargetExecutionCount(target, count)`.
- Optional lifecycle methods: `beginTargetExecution(target, result)`, `finishTargetExecution(target, result)`, `cancelTargetExecution(target, result)`, `failTargetExecution(target, result)`, and `skipTargetExecution(target, result)`.
- Optional path method: `onDidChangePath(callback)`, used to keep kernel mappings stable when an unsaved adapter item is saved or renamed.

`finishTargetExecution` receives `{ kernel, success, status, lastExecutionTime }`, where `status` is one of `"ok"`, `"error"`, `"failed"`, `"cancelled"`, or `"skipped"`.

## Provided Service `hydrogen.provider`

Allows other packages to interact with Jupyter kernels: execute code, get completions, inspect objects, and monitor kernel state.

In your `package.json`:

```json
{
  "consumedServices": {
    "hydrogen.provider": {
      "versions": {
        "^1.3.0": "consumeHydrogen"
      }
    }
  }
}
```

In your main module:

```javascript
module.exports = {
  consumeHydrogen(hydrogen) {
    this.hydrogen = hydrogen;
  },

  async example() {
    const kernel = this.hydrogen.getActiveKernel();
    const result = await kernel.execute("print('Hello')");
    console.log(result.status); // 'ok' or 'error'
  },
};
```

### HydrogenProvider methods

| Method                        | Description                          |
| ----------------------------- | ------------------------------------ |
| `getActiveKernel()`           | Get the kernel for the active editor |
| `onDidChangeKernel(callback)` | Subscribe to kernel changes          |
| `getCellRange(editor)`        | Get the current cell range           |

### HydrogenKernel API

#### Execution

| Method                                | Description                                               |
| ------------------------------------- | --------------------------------------------------------- |
| `execute(code)`                       | Execute code, returns `Promise<{status, outputs, error}>` |
| `executeWithCallback(code, callback)` | Execute with streaming callback                           |

#### State & Control

| Property/Method                       | Description                                      |
| ------------------------------------- | ------------------------------------------------ |
| `executionState`                      | Current state: `'idle'`, `'busy'`, `'starting'`  |
| `executionCount`                      | Current execution count                          |
| `lastExecutionTime`                   | Last execution time string (e.g., `"1.23s"`)     |
| `onDidChangeExecutionState(callback)` | Subscribe to state changes, returns `Disposable` |
| `interrupt()`                         | Interrupt running execution                      |
| `restart([callback])`                 | Restart the kernel                               |
| `shutdown()`                          | Shutdown the kernel                              |

#### Introspection

| Method                     | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `complete(code)`           | Get completions, returns `Promise<{matches, ...}>`  |
| `inspect(code, cursorPos)` | Get documentation, returns `Promise<{data, found}>` |

#### Kernel info

| Property/Method       | Description                              |
| --------------------- | ---------------------------------------- |
| `language`            | Kernel language (e.g., `"python"`)       |
| `displayName`         | Kernel display name (e.g., `"Python 3"`) |
| `kernelSpec`          | Full kernel spec object                  |
| `getConnectionFile()` | Path to kernel connection file           |

#### Events & Middleware

| Method                      | Description                     |
| --------------------------- | ------------------------------- |
| `onDidDestroy(callback)`    | Called when kernel is destroyed |
| `addMiddleware(middleware)` | Add execution middleware        |

### Example: Execute and Handle Results

```javascript
async function runCode(hydrogen) {
  const kernel = hydrogen.getActiveKernel();

  // Simple execution
  const result = await kernel.execute("x = 42\nprint(x)");

  if (result.status === "ok") {
    console.log("Outputs:", result.outputs);
  } else {
    console.error(`${result.error.ename}: ${result.error.evalue}`);
  }

  // Monitor state
  const disposable = kernel.onDidChangeExecutionState((state) => {
    console.log("Kernel state:", state);
  });

  // Get completions
  const completions = await kernel.complete("import nu");
  console.log(completions.matches); // ['numpy', 'numbers', ...]

  // Cleanup
  disposable.dispose();
}
```

## Provided Service `autocomplete.provider`

Provides kernel-backed completions to Lumine autocomplete consumers while a Hydrogen kernel is active for the editor. This service is provided as `autocomplete.provider@4.0.0` through `provideAutocompleteResults`.

## Provided Service `hydrogen.breakpoints`

Provides breakpoint state for integrations that need to inspect or render Hydrogen breakpoints. This service is provided as `hydrogen.breakpoints@0.0.1` through `provideBreakpoints`.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!

/** @babel */

/**
 * A modal panel for executing code in kernel with history tracking
 */
export default class ExecPanel {
  constructor(store) {
    this.store = store;
    this.history = [];
    this.session = null;
  }

  toggle() {
    return atom.modals.toggle({
      id: "jupyter-repl.exec-panel",
      className: "jupyter-repl exec-panel",
      emptyMessage: "No history yet. Enter code above to execute.",
      placeholder: "Enter code to execute...",
      // The query is the code to run, not a filter, so nothing is focused until
      // the user deliberately arrows into the history.
      initialActivation: "none",
      source: () => this.history,
      // Every entry stays visible, in history order — but the typed code is
      // still marked up against each one, as the old identity filter did.
      matcher: atom.modals.matchers.custom((items, query) => {
        if (!query.text) return items;
        return items.map((item) => ({
          item,
          highlights: { label: matchOffsets(item.code, query.text) },
        }));
      }),
      willOpen: (session) => {
        this.session = session;
      },
      didClose: () => {
        this.session = null;
      },
      renderer: {
        entry: (entry) => ({ id: entry, text: entry.code }),
        row: (entry) => ({
          className: "exec-history-item",
          label: entry.code,
          detail: statusLine(entry),
        }),
      },
      // Confirming a history row copies it into the query for editing. Select
      // "none" rather than "reset": leaving a row focused would make the next
      // Enter re-copy it instead of executing what is now in the field.
      confirm: ({ item }) => ({ keepOpen: true, query: item.code, select: "none" }),
      confirmEmpty: async ({ query }) => {
        const code = query.text.trim();
        if (!code) return { keepOpen: true };
        await this.execute(code);
        return { keepOpen: true, query: "", select: "none", refresh: true };
      },
    });
  }

  async execute(code) {
    if (!code) return;

    const kernel = this.store.kernel;
    if (!kernel) {
      atom.notifications.addError("No kernel running");
      return;
    }

    // Add to history as running
    const entry = this.addToHistory(code, "running");

    // Execute using plugin API
    const jupyterKernel = kernel.getPluginWrapper();
    const result = await jupyterKernel.execute(code);
    entry.status = result.status;
    if (result.status === "error") {
      entry.error = result.error;
    }
  }

  addToHistory(text, status = "ok") {
    const entry = {
      code: text,
      timestamp: new Date(),
      status,
      error: null,
    };

    // Remove duplicate if exists
    const existingIndex = this.history.findIndex((h) => h.code === text);
    if (existingIndex !== -1) {
      this.history.splice(existingIndex, 1);
    }

    this.history.unshift(entry);
    // Show the entry while it is still running; the confirm result refreshes
    // again once the kernel has answered.
    if (this.session) this.session.refresh();

    return entry;
  }

  destroy() {
    if (this.session) this.session.cancel("api");
    this.session = null;
  }
}

// Match offsets of the typed code against one history entry, using the same
// matcher and defaults the list used to get them from.
function matchOffsets(candidate, query) {
  const hit = atom.ui.fuzzyMatcher.match(candidate, query, { recordMatchIndexes: true });
  return hit ? (hit.matchIndexes ?? []) : [];
}

// Secondary line: outcome glyph plus the time the entry was submitted.
//
// An element, never a DocumentFragment: the Row descriptor this lands in is
// cached per visible index, and appending a fragment empties it — a second
// render of the same cached row (any `{keepOpen: true}` result re-renders
// without re-filtering) would then paint a blank secondary line.
function statusLine(entry) {
  const line = document.createElement("span");
  line.classList.add("exec-status-line");

  const statusIcon = document.createElement("span");
  statusIcon.classList.add("exec-status");
  if (entry.status === "ok") {
    statusIcon.classList.add("icon", "icon-check", "text-success");
  } else if (entry.status === "error") {
    statusIcon.classList.add("icon", "icon-x", "text-error");
    if (entry.error) {
      statusIcon.title = `${entry.error.ename}: ${entry.error.evalue}`;
    }
  } else {
    statusIcon.classList.add("icon", "icon-sync", "text-info");
  }

  const timeEl = document.createElement("span");
  timeEl.classList.add("exec-time");
  timeEl.textContent = entry.timestamp.toLocaleTimeString();

  line.appendChild(statusIcon);
  line.appendChild(timeEl);
  return line;
}

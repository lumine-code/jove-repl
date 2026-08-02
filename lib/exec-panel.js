/** @babel */

import { CompositeDisposable } from "atom";

// The outcome badge, one class list per recorded status.
const STATUS_BADGES = {
  running: "badge-info icon icon-sync",
  ok: "badge-success icon icon-check",
  error: "badge-error icon icon-x",
};

/**
 * Builds the outcome badge for an entry. A node rather than a descriptor so a
 * failed entry can carry the exception as its tooltip.
 * @param {Object} entry - The history entry to describe
 * @returns {HTMLSpanElement} The badge element
 */
function statusBadge(entry) {
  const badge = document.createElement("span");
  badge.className = `exec-status badge ${STATUS_BADGES[entry.status] ?? STATUS_BADGES.running}`;
  if (entry.error) {
    badge.title = `${entry.error.ename}: ${entry.error.evalue}`;
  }
  return badge;
}

/**
 * A modal panel for executing code on the running kernel, over a history list.
 *
 * The query editor is the prompt and the list below it is the session's
 * history, newest first. Nothing is deduplicated: a history records what
 * happened, so running the same code twice leaves two entries, each with its
 * own outcome and time.
 */
export default class ExecPanel {
  constructor(store) {
    this.store = store;
    this.history = [];

    this.selectList = atom.workspace.buildSelectList({
      className: "jupyter-repl exec-panel",
      crumb: "Exec History",
      emptyMessage: "No history to show. Enter code above to execute.",
      placeholderText: "Enter code to execute...",
      // Nothing is selected until the list is navigated, so Enter runs what is
      // typed rather than whatever entry happens to sit at the top.
      initialSelectionIndex: undefined,
      // No `willShow`: every change to the history goes through addToHistory,
      // which hands the list its new items there and then, so the list is
      // already current when the panel opens. Re-seeding it on show would also
      // reset the selection, and the modal flow shows the panel again on the
      // way back from the actions list — dropping the very entry the action
      // was picked for.
      filterKeyForItem: (entry) => entry.code,
      // Outcome and time go in the trailing block, so they line up down the
      // right edge instead of trailing code of every length. The code itself
      // is monospaced by the stylesheet — it is read as code, not as prose.
      elementForItem: (entry, { filterKey, highlight }) => ({
        className: "exec-history-item",
        primary: highlight(filterKey),
        trailing: [
          statusBadge(entry),
          { text: entry.timestamp.toLocaleTimeString(), className: "exec-time badge" },
        ],
      }),
      didConfirmSelection: (entry) => this.runEntry(entry),
      didConfirmEmptySelection: () => this.execute(),
      didCancelSelection: () => this.selectList.hide(),
    });

    // Registered in the package's own namespace: the item-actions list (F12)
    // derives its rows — label, description, keybinding — from these
    // registrations and the keymap, so nothing is documented twice. Running is
    // listed like any other action even though Enter reaches it as chrome,
    // through core:confirm and didConfirmSelection; routing it back through
    // the list's own confirm keeps the key, a click on a row, and the action
    // on one path.
    this.disposables = new CompositeDisposable(
      atom.commands.add(this.selectList.element, {
        "jupyter-repl:run-history-entry": {
          description: "Run the selected entry and close the panel",
          didDispatch: () => this.selectList.confirmSelection(),
        },
        "jupyter-repl:recall-history-entry": {
          description: "Put the selected entry back in the prompt to edit before running it",
          didDispatch: () => this.recallSelection(),
        },
      }),
    );
  }

  toggle() {
    this.selectList.toggle();
  }

  /**
   * Runs whatever is typed in the prompt, clearing it first so the next line
   * can be typed while this one is still running.
   */
  async execute() {
    const code = this.selectList.getQuery().trim();
    if (!code) return;

    this.selectList.reset();
    await this.run(code);
  }

  /**
   * Runs a history entry and closes the panel, so its output is visible
   * straight away.
   * @param {Object} entry - The history entry to re-run
   */
  async runEntry(entry) {
    this.selectList.hide();
    await this.run(entry.code);
  }

  /**
   * Puts the selected entry back in the prompt so it can be edited before
   * running. The panel stays open and the selection is dropped, so Enter then
   * runs what is in the prompt rather than the entry it came from.
   */
  recallSelection() {
    const entry = this.selectList.getSelectedItem();
    if (!entry) return;

    this.selectList.refs.queryEditor.setText(entry.code);
    this.selectList.selectNone();
  }

  /**
   * Executes code on the running kernel, recording the attempt in the history
   * before it starts so a run that never finishes is still listed.
   * @param {string} code - The code to execute
   */
  async run(code) {
    const kernel = this.store.kernel;
    if (!kernel) {
      atom.notifications.addError("No kernel running");
      return;
    }

    const entry = this.addToHistory(code, "running");

    // Execute using plugin API
    const jupyterKernel = kernel.getPluginWrapper();
    const result = await jupyterKernel.execute(code);
    entry.status = result.status;
    if (result.status === "error") {
      entry.error = result.error;
    }

    await this.selectList.update({ items: this.history });
  }

  addToHistory(text, status = "ok") {
    const entry = {
      code: text,
      timestamp: new Date(),
      status,
      error: null,
    };

    this.history.unshift(entry);
    this.selectList.update({ items: this.history });

    return entry;
  }

  destroy() {
    this.disposables.dispose();
    this.selectList.destroy();
  }
}

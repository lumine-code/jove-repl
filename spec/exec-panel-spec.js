/** @babel */

import ExecPanel, { relativeTime } from "../lib/exec-panel";

// The exec panel is a REPL prompt on top of a select list: the query editor
// holds code to execute, and the list below is the execution history. The
// history filters like every other picker, but nothing is auto-selected, so
// Enter executes the typed code unless a row was chosen explicitly, in which
// case it re-runs that row.
describe("jupyter-repl exec panel", () => {
  let panel;
  let store;
  let executedCodes;
  let execResult;

  beforeEach(() => {
    executedCodes = [];
    execResult = { status: "ok" };
    store = {
      kernel: {
        getPluginWrapper: () => ({
          execute: (code) => {
            executedCodes.push(code);
            return Promise.resolve(execResult);
          },
        }),
      },
    };
    panel = new ExecPanel(store);
  });

  afterEach(() => {
    panel.destroy();
  });

  it("lists the whole history, newest first, while the query is empty", () => {
    panel.addToHistory("first");
    panel.addToHistory("second");

    expect(panel.selectList.items.map((entry) => entry.code)).toEqual(["second", "first"]);
    expect(panel.selectList.getSelectedItem()).toBeNull();
  });

  it("keeps a repeated execution as its own entry", async () => {
    panel.selectList.refs.queryEditor.setText("1 + 1");
    await panel.execute();
    panel.selectList.refs.queryEditor.setText("1 + 1");
    await panel.execute();

    // A history records what happened: two runs are two entries, each with its
    // own outcome and time.
    expect(panel.history.map((entry) => entry.code)).toEqual(["1 + 1", "1 + 1"]);
    expect(panel.history[0]).not.toBe(panel.history[1]);
  });

  it("filters the history to entries matching the query and highlights the match", async () => {
    panel.addToHistory("print(value)");
    panel.addToHistory("import numpy");

    panel.selectList.refs.queryEditor.setText("num");
    await panel.selectList.update({});

    expect(panel.selectList.items.map((entry) => entry.code)).toEqual(["import numpy"]);
    expect(panel.selectList.getSelectedItem()).toBeNull();

    const matched = Array.from(
      panel.selectList.refs.items.querySelectorAll(".character-match"),
      (el) => el.textContent,
    );
    expect(matched.join("")).toBe("num");
  });

  it("badges each row with its age and outcome on the right, outcome outermost", async () => {
    execResult = { status: "error", error: { ename: "NameError", evalue: "x" } };
    panel.selectList.refs.queryEditor.setText("x");
    await panel.execute();
    await panel.selectList.update({});

    const row = panel.selectList.refs.items.querySelector(".exec-history-item");
    const trailing = row.querySelector(".trailing-block");
    const status = trailing.querySelector(".exec-status");
    const time = trailing.querySelector(".exec-time");

    expect(status.classList.contains("badge-error")).toBe(true);
    expect(status.classList.contains("icon-x")).toBe(true);
    expect(status.title).toBe("NameError: x");
    expect(time.textContent).toBe(relativeTime(panel.history[0].timestamp));
    // The outcome holds the right edge, with the age inside it.
    expect(Array.from(trailing.children)).toEqual([time, status]);
  });

  it("ages an entry in the largest unit that counts more than one of itself", () => {
    const ago = (ms) => relativeTime(new Date(Date.now() - ms));
    const expected = (value, unit) =>
      new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "narrow" }).format(
        value,
        unit,
      );

    expect(ago(0)).toBe(expected(0, "second"));
    expect(ago(5 * 1000)).toBe(expected(-5, "second"));
    expect(ago(2 * 60 * 1000)).toBe(expected(-2, "minute"));
    expect(ago(3 * 60 * 60 * 1000)).toBe(expected(-3, "hour"));
    expect(ago(4 * 24 * 60 * 60 * 1000)).toBe(expected(-4, "day"));
  });

  it("confirms an empty selection by executing instead of recalling", () => {
    spyOn(panel, "execute");
    panel.addToHistory("import numpy");
    panel.selectList.refs.queryEditor.setText("num");

    panel.selectList.confirmSelection();

    expect(panel.execute).toHaveBeenCalled();
  });

  it("runs the selection through its own command, so the key is an action", async () => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace));
    panel.selectList.show();
    panel.addToHistory("import numpy");
    await panel.selectList.selectIndex(0);

    atom.commands.dispatch(
      panel.selectList.refs.queryEditor.element,
      "jupyter-repl:run-history-entry",
    );
    await panel.selectList.update({});

    expect(executedCodes).toEqual(["import numpy"]);
    expect(panel.selectList.isVisible()).toBeFalsy();
  });

  it("falls back to the prompt when the run command fires with nothing selected", () => {
    spyOn(panel, "execute");
    panel.selectList.refs.queryEditor.setText("1 + 1");

    atom.commands.dispatch(
      panel.selectList.refs.queryEditor.element,
      "jupyter-repl:run-history-entry",
    );

    expect(panel.execute).toHaveBeenCalled();
  });

  it("re-runs a confirmed entry and closes the panel", async () => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace));
    panel.selectList.show();
    panel.addToHistory("import numpy");
    await panel.selectList.selectIndex(0);

    panel.selectList.confirmSelection();
    await panel.selectList.update({});

    expect(executedCodes).toEqual(["import numpy"]);
    expect(panel.selectList.isVisible()).toBeFalsy();
    // The re-run is logged in its own right, above the entry it came from.
    expect(panel.history.map((entry) => entry.code)).toEqual(["import numpy", "import numpy"]);
  });

  it("recalls the selected entry into the prompt without running it", async () => {
    panel.addToHistory("import numpy");
    await panel.selectList.selectIndex(0);

    panel.recallSelection();

    expect(panel.selectList.getQuery()).toBe("import numpy");
    expect(executedCodes).toEqual([]);
    // The selection is dropped, so Enter runs the prompt rather than the entry
    // it was recalled from. The recalled code matches itself, so the entry
    // stays visible.
    expect(panel.selectList.getSelectedItem()).toBeNull();
    expect(panel.selectList.items.map((entry) => entry.code)).toEqual(["import numpy"]);
  });

  it("recalls nothing when no entry is selected", () => {
    panel.addToHistory("import numpy");
    panel.selectList.refs.queryEditor.setText("num");

    panel.recallSelection();

    expect(panel.selectList.getQuery()).toBe("num");
  });

  it("executes the query, closes the panel, and restores the full history view", async () => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace));
    panel.selectList.show();
    panel.selectList.refs.queryEditor.setText("1 + 1");

    await panel.execute();

    expect(executedCodes).toEqual(["1 + 1"]);
    expect(panel.history.map((entry) => [entry.code, entry.status])).toEqual([["1 + 1", "ok"]]);
    // Running typed code closes the panel for the same reason re-running an
    // entry does: the point of running it is to see its output. The prompt
    // goes with it, so the next open lists the whole history.
    expect(panel.selectList.isVisible()).toBeFalsy();
    expect(panel.selectList.getQuery()).toBe("");
    expect(panel.selectList.items).toEqual(panel.history);
  });

  it("keeps the panel and the typed code when there is no kernel to run on", async () => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace));
    store.kernel = null;
    panel.selectList.show();
    panel.selectList.refs.queryEditor.setText("1 + 1");

    await panel.execute();

    expect(atom.notifications.getNotifications().map((n) => n.getMessage())).toEqual([
      "No kernel running",
    ]);
    expect(panel.selectList.isVisible()).toBeTruthy();
    expect(panel.selectList.getQuery()).toBe("1 + 1");
    expect(panel.history).toEqual([]);
  });

  it("records a failed execution on its history entry", async () => {
    execResult = { status: "error", error: { ename: "NameError", evalue: "x" } };
    panel.selectList.refs.queryEditor.setText("x");

    await panel.execute();

    expect(panel.history[0].status).toBe("error");
    expect(panel.history[0].error).toEqual({ ename: "NameError", evalue: "x" });
  });
});

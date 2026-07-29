/** @babel */

import ExecPanel from "../lib/exec-panel";

// The exec panel is a REPL prompt on top of a select list: the query editor
// holds code to execute, and the list below is the execution history. The
// history filters like every other picker, but nothing is auto-selected, so
// Enter always executes the typed code unless a row was chosen explicitly.
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

  it("confirms an empty selection by executing instead of recalling", () => {
    spyOn(panel, "execute");
    panel.addToHistory("import numpy");
    panel.selectList.refs.queryEditor.setText("num");

    panel.selectList.confirmSelection();

    expect(panel.execute).toHaveBeenCalled();
  });

  it("recalls a confirmed entry into the query editor and keeps it listed", async () => {
    panel.addToHistory("import numpy");
    await panel.selectList.selectIndex(0);

    panel.selectList.confirmSelection();

    expect(panel.selectList.getQuery()).toBe("import numpy");
    expect(panel.selectList.getSelectedItem()).toBeNull();
    // The recalled code matches itself, so the entry stays visible.
    expect(panel.selectList.items.map((entry) => entry.code)).toEqual(["import numpy"]);
  });

  it("executes the query, logs it, and restores the full history view", async () => {
    panel.selectList.refs.queryEditor.setText("1 + 1");

    await panel.execute();

    expect(executedCodes).toEqual(["1 + 1"]);
    expect(panel.history.map((entry) => [entry.code, entry.status])).toEqual([["1 + 1", "ok"]]);
    expect(panel.selectList.getQuery()).toBe("");
    expect(panel.selectList.items).toEqual(panel.history);
  });

  it("records a failed execution on its history entry", async () => {
    execResult = { status: "error", error: { ename: "NameError", evalue: "x" } };
    panel.selectList.refs.queryEditor.setText("x");

    await panel.execute();

    expect(panel.history[0].status).toBe("error");
    expect(panel.history[0].error).toEqual({ ename: "NameError", evalue: "x" });
  });
});

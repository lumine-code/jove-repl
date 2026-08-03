/** @babel */

import ExecPanel from "../lib/exec-panel";
import KernelPicker from "../lib/kernel-picker";

describe("jupyter-repl kernel picker item actions", () => {
  let picker;

  beforeEach(async () => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace));
    // The package activates on its commands, so dispatch one to trigger it;
    // activation also loads the package keymap the actions list reads.
    const activation = atom.packages.activatePackage("jupyter-repl");
    atom.commands.dispatch(atom.views.getView(atom.workspace), "jupyter-repl:debug-toggle");
    await activation;
    picker = new KernelPicker([
      { name: "python3", display_name: "Python 3" },
      { name: "ir", display_name: "R" },
    ]);
  });

  afterEach(async () => {
    picker.destroy();
    await atom.packages.deactivatePackage("jupyter-repl");
  });

  it("derives its actions from the command registrations and the keymap", () => {
    const actions = picker.selectList.itemActions();
    const byCommand = new Map(actions.map((action) => [action.command, action]));

    const insertComment = byCommand.get("jupyter-repl:insert-kernel-comment");
    expect(insertComment.name).toBe("Insert Kernel Comment");
    expect(insertComment.description).toBe(
      "Insert or update the kernel magic comment on the first line of the editor",
    );
    expect(insertComment.keystrokes).toEqual(["ctrl-enter"]);

    const updateKernels = byCommand.get("jupyter-repl:update-kernels");
    expect(updateKernels.description).toBe("Rescan the kernel specs on disk and reload the list");
    expect(updateKernels.keystrokes).toEqual(["f5"]);

    // Every action explains itself with more than a restated title.
    for (const action of actions) {
      expect(action.description).toBeTruthy();
    }

    // Chrome and global commands stay out.
    expect(byCommand.has("core:confirm")).toBe(false);
    expect(byCommand.has("select-list:actions")).toBe(false);
    expect(byCommand.has("jupyter-repl:run")).toBe(false);
    expect(byCommand.has("jupyter-repl:debug-toggle")).toBe(false);
  });

  it("shows the actions as a flow step and runs one against the kernel list", async () => {
    picker.selectList.show();

    await picker.selectList.showItemActions();

    expect(picker.selectList.itemActionsList.isVisible()).toBeTruthy();
    expect(atom.workspace.getModalTrail()).toEqual(["Kernels", "Actions"]);
    // The actions list wears the picker's classes, so the package keymap
    // resolves action keystrokes inside it too.
    expect(picker.selectList.itemActionsList.element.classList.contains("kernel-picker")).toBe(
      true,
    );

    const spy = spyOn(picker, "updateKernels");
    const index = picker.selectList.itemActionsList.items.findIndex(
      (item) => item.command === "jupyter-repl:update-kernels",
    );
    picker.selectList.itemActionsList.selectIndex(index);
    picker.selectList.itemActionsList.confirmSelection();

    expect(spy).toHaveBeenCalled();
    expect(picker.selectList.isVisible()).toBeTruthy();
    expect(picker.selectList.itemActionsList.isVisible()).toBeFalsy();
  });

  it("runs an action against the kernel the user highlighted", async () => {
    await atom.packages.activatePackage("language-python");
    const editor = await atom.workspace.open("kernel-comment.py");
    picker.selectList.show();
    // The second kernel, so an action that silently fell back to the top of
    // the list would name the wrong one.
    await picker.selectList.selectIndex(1);

    await picker.selectList.showItemActions();
    const index = picker.selectList.itemActionsList.items.findIndex(
      (item) => item.command === "jupyter-repl:insert-kernel-comment",
    );
    picker.selectList.itemActionsList.selectIndex(index);
    picker.selectList.itemActionsList.confirmSelection();

    expect(editor.lineTextForBufferRow(0)).toBe("#:: ir");
  });
});

describe("jupyter-repl exec panel item actions", () => {
  let panel;

  beforeEach(async () => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace));
    const activation = atom.packages.activatePackage("jupyter-repl");
    atom.commands.dispatch(atom.views.getView(atom.workspace), "jupyter-repl:debug-toggle");
    await activation;
    panel = new ExecPanel({ kernel: null });
  });

  afterEach(async () => {
    panel.destroy();
    await atom.packages.deactivatePackage("jupyter-repl");
  });

  it("offers both entry commands as actions, bound to the keys the panel documents", () => {
    const actions = panel.selectList.itemActions();
    const byCommand = new Map(actions.map((action) => [action.command, action]));

    const run = byCommand.get("jupyter-repl:run-history-entry");
    expect(run.name).toBe("Run History Entry");
    expect(run.description).toBe("Run the selected entry and close the panel");
    // Enter reaches it as chrome, through core:confirm, so the keymap binds
    // nothing of its own — the row is listed without a key, like every other
    // list's confirm action.
    expect(run.keystrokes).toEqual([]);

    const recall = byCommand.get("jupyter-repl:recall-history-entry");
    expect(recall.name).toBe("Recall History Entry");
    expect(recall.description).toBe(
      "Put the selected entry back in the prompt to edit before running it",
    );
    expect(recall.keystrokes).toEqual(["shift-enter"]);

    // Chrome and another picker's keymap stay out.
    expect(byCommand.has("core:confirm")).toBe(false);
    expect(byCommand.has("jupyter-repl:insert-kernel-comment")).toBe(false);
  });

  it("leaves Enter bound to the chrome, so it still confirms inside the actions list", () => {
    // The actions list wears the panel's own classes, so a package binding on
    // Enter would follow it in and run a history entry instead of the action
    // under the cursor. The panel binds nothing on Enter for that reason.
    const bindings = atom.keymaps.findKeyBindings({
      keystrokes: "enter",
      target: panel.selectList.refs.queryEditor.element,
    });

    expect(bindings[0].command).toBe("core:confirm");
  });

  it("runs the action against the panel's selection", async () => {
    panel.addToHistory("import numpy");
    await panel.selectList.selectIndex(0);
    panel.selectList.show();

    await panel.selectList.showItemActions();
    expect(atom.workspace.getModalTrail()).toEqual(["Exec History", "Actions"]);

    const index = panel.selectList.itemActionsList.items.findIndex(
      (item) => item.command === "jupyter-repl:recall-history-entry",
    );
    panel.selectList.itemActionsList.selectIndex(index);
    panel.selectList.itemActionsList.confirmSelection();

    expect(panel.selectList.getQuery()).toBe("import numpy");
    expect(panel.selectList.isVisible()).toBeTruthy();
  });
});

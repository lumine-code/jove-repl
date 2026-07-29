/** @babel */

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
    picker = new KernelPicker([{ name: "python3", display_name: "Python 3" }]);
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
});

/** @babel */

import { log } from "./utils";
import { escapeStringRegexp, getCommentStartString } from "./code-manager";

export default class KernelPicker {
  constructor(kernelSpecs) {
    this.kernelSpecs = kernelSpecs;
    this.onConfirmed = null;
    this.onUpdate = null;
  }

  toggle() {
    return atom.modals.toggle({
      id: "jupyter-repl.kernel-picker",
      className: "jupyter-repl kernel-picker",
      emptyMessage: "No kernels found",
      // Read at open time: the callers keep one picker alive and reassign
      // `kernelSpecs` before each toggle.
      source: () => this.kernelSpecs,
      help:
        "Available commands:\n" +
        "- **Enter**: Start kernel\n" +
        "- **Ctrl+Enter**: Insert kernel as magic comment\n" +
        "- **F5**: Refresh kernels",
      renderer: {
        // Two kernelspecs can share a display name (same kernel registered in
        // two environments), so identity is the spec object.
        entry: (item) => ({ id: item, text: item.display_name }),
        row: (item) => ({ label: item.display_name }),
      },
      actions: [
        {
          name: "insert-magic-comment",
          label: "Insert kernel as magic comment",
          keystroke: "ctrl-enter",
          run: ({ item, target }) => this.insertKernelComment(item, target.editor),
        },
        {
          name: "update-kernels",
          label: "Refresh kernels",
          keystroke: "f5",
          when: "always",
          run: async ({ session }) => {
            if (!this.onUpdate) {
              return { keepOpen: true };
            }
            session.setStatus({ busy: true, message: "Loading kernels..." });
            try {
              this.kernelSpecs = await this.onUpdate();
            } finally {
              session.setStatus({ busy: false, message: null });
            }
            return { keepOpen: true, refresh: true };
          },
        },
      ],
      confirm: ({ item }) => {
        log("Selected kernel:", item);
        if (this.onConfirmed) {
          this.onConfirmed(item);
        }
      },
    });
  }

  /**
   * Insert or modify the kernel magic comment (<comment>:: kernelname) at the first line.
   * Uses the editor's language-specific comment character.
   */
  insertKernelComment(item, editor) {
    if (!editor) {
      return;
    }

    // Get the comment start string for the current language
    const commentStart = getCommentStartString(editor);
    if (!commentStart) {
      log("No comment string defined for current language");
      return;
    }

    const kernelLine = `${commentStart}:: ${item.name}`;
    const buffer = editor.getBuffer();
    const firstLine = buffer.lineForRow(0);

    // Match existing magic comment with any comment prefix
    const escapedComment = escapeStringRegexp(commentStart);
    const existingMagicComment =
      firstLine && firstLine.match(new RegExp(`^${escapedComment}::\\s*`));

    if (existingMagicComment) {
      // Replace existing kernel magic comment line
      buffer.setTextInRange(
        [
          [0, 0],
          [0, firstLine.length],
        ],
        kernelLine,
      );
    } else {
      // Insert new kernel magic comment with empty line after
      buffer.insert([0, 0], kernelLine + "\n\n");
    }

    log("Inserted kernel comment:", kernelLine);
  }
}

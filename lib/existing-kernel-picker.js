/** @babel */

import store from "./store";
import { log, kernelSpecProvidesGrammar, tildify } from "./utils";

function getName(kernel) {
  const prefix = kernel.transport.gatewayName ? `${kernel.transport.gatewayName}: ` : "";
  return `${prefix + kernel.displayName} - ${store
    .getFilesForKernel(kernel)
    .map(tildify)
    .join(", ")}`;
}

export default class ExistingKernelPicker {
  constructor() {
    this.selectList = atom.workspace.buildSelectList({
      className: "jupyter-repl existing-kernel-picker",
      filterKeyForItem: (kernel) => getName(kernel),
      willShow: async () => {
        await this.selectList.update({
          items: store.runningKernels.filter((kernel) =>
            kernelSpecProvidesGrammar(kernel.kernelSpec, store.grammar),
          ),
        });
        const markers = store.markers;
        if (markers) {
          markers.clear();
        }
      },
      elementForItem: (kernel, { filterKey, highlight }) => {
        const element = document.createElement("li");
        element.appendChild(highlight(filterKey));
        return element;
      },
      didConfirmSelection: (kernel) => {
        log("Selected kernel:", kernel);
        this.selectList.hide();
        const { filePath, editor, grammar } = store;
        if (!filePath || !editor || !grammar) {
          return;
        }
        store.newKernel(kernel, filePath, editor, grammar);
      },
      didCancelSelection: () => this.selectList.hide(),
      emptyMessage: "No running kernels for this language.",
    });
  }

  destroy() {
    this.selectList.destroy();
  }

  toggle() {
    this.selectList.toggle();
  }
}

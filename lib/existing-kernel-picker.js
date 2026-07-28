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

export default function toggleExistingKernelPicker() {
  return atom.modals.toggle({
    id: "jupyter-repl.existing-kernel-picker",
    className: "jupyter-repl existing-kernel-picker",
    emptyMessage: "No running kernels for this language.",
    willOpen: () => {
      // The markers of the file we are about to re-point belong to whichever
      // kernel owned it; drop them before the hand-over.
      const markers = store.markers;
      if (markers) {
        markers.clear();
      }
    },
    source: () =>
      store.runningKernels.filter((kernel) =>
        kernelSpecProvidesGrammar(kernel.kernelSpec, store.grammar),
      ),
    renderer: {
      // Two kernels can carry the same display name and file list, so identity
      // is the kernel itself.
      entry: (kernel) => ({ id: kernel, text: getName(kernel) }),
      row: (kernel) => ({ label: getName(kernel) }),
    },
    confirm: ({ item: kernel }) => {
      log("Selected kernel:", kernel);
      const { filePath, editor, grammar } = store;
      if (!filePath || !editor || !grammar) {
        return;
      }
      store.newKernel(kernel, filePath, editor, grammar);
    },
  });
}

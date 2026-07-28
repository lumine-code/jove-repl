/** @babel */

import WSKernel from "../../../ws-kernel";
import { log } from "../../../utils";

const basicCommands = [
  {
    name: "Interrupt kernel",
    value: "interrupt-kernel",
  },
  {
    name: "Restart kernel",
    value: "restart-kernel",
  },
  {
    name: "Shut down kernel",
    value: "shutdown-kernel",
  },
];
const wsKernelCommands = [
  {
    name: "Rename session",
    value: "rename-kernel",
  },
  {
    name: "Disconnect kernel",
    value: "disconnect-kernel",
  },
];
const terminalCommands = [
  {
    name: "Open Jupyter console in terminal",
    value: "open-jupyter-console",
  },
  {
    name: "Spawn Jupyter console terminal",
    value: "spawn-jupyter-console",
  },
];

function commandsFor(store) {
  const kernel = store && store.kernel;
  if (!kernel) {
    return [];
  }
  const commands =
    kernel.transport instanceof WSKernel
      ? [...basicCommands, ...wsKernelCommands, ...terminalCommands]
      : [...basicCommands, ...terminalCommands];
  return commands.map((command) => ({ name: command.name, command: command.value }));
}

export default function toggleSignalList(store, handleKernelCommand) {
  return atom.modals.toggle({
    id: "jupyter-repl.signal-list",
    className: "jupyter-repl signal-list",
    emptyMessage: "No running kernels for this file type.",
    source: () => commandsFor(store),
    renderer: {
      entry: (item) => ({ id: item.command, text: item.name }),
      row: (item) => ({ label: item.name }),
    },
    confirm: ({ item }) => {
      log("Selected command:", item);
      if (handleKernelCommand) {
        handleKernelCommand(item, store);
      }
    },
  });
}

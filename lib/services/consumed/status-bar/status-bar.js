/** @babel */
/** @jsx React.createElement */

import React from "react";
import { Disposable } from "atom";
import StatusBar from "./status-bar-component";
import toggleSignalList from "./signal-list-view";
import { reactFactory } from "../../../utils";

export class StatusBarConsumer {
  addStatusBar(store, statusBar, handleKernelCommand) {
    const statusBarElement = document.createElement("div");
    statusBarElement.classList.add("inline-block", "jupyter-repl");
    // Language-tooling band, see the priority convention in the status-bar
    // package README.
    const statusBarTile = statusBar.addLeftTile({
      item: statusBarElement,
      priority: 410,
    });

    const onClick = (store) => {
      this.showKernelCommands(store, handleKernelCommand);
    };

    reactFactory(
      <StatusBar store={store} onClick={onClick} container={statusBarElement} />,
      statusBarElement,
    );
    const disposable = new Disposable(() => statusBarTile.destroy());
    store.subscriptions.add(disposable);
    return disposable;
  }

  showKernelCommands(store, handleKernelCommand) {
    toggleSignalList(store, handleKernelCommand);
  }
}
const statusBarConsumer = new StatusBarConsumer();
export default statusBarConsumer;

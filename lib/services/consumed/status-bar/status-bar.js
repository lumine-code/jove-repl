/** @babel */
/** @jsx React.createElement */

import React from "react";
import { Disposable } from "atom";
import StatusBar from "./status-bar-component";
import SignalListView from "./signal-list-view";
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
    let signalListView = this.signalListView;

    if (!signalListView) {
      signalListView = new SignalListView(store, handleKernelCommand);
      this.signalListView = signalListView;
    } else {
      signalListView.store = store;
    }

    signalListView.toggle();
  }
}
const statusBarConsumer = new StatusBarConsumer();
export default statusBarConsumer;

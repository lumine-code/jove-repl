const { log, INSPECTOR_URI, OUTPUT_AREA_URI, openOrShowDock } = require("./utils");
const { getExpressionAtCursor } = require("./code-manager");
const OutputPane = require("./panes/output-area");
const { inspectorStore } = require("./store/inspector-store");

function isInspectorFocused() {
  const element = atom.workspace.paneForURI(INSPECTOR_URI)?.element;
  return Boolean(
    element &&
    (element.offsetWidth !== 0 || element.offsetHeight !== 0) &&
    element.contains(document.activeElement),
  );
}

async function showInspector(store, adapterServices = null) {
  if (isInspectorFocused()) {
    atom.workspace.getCenter().activate();
    return;
  }
  const item = await atom.workspace.open(INSPECTOR_URI, { searchAllPanes: true });
  setInspector(store, adapterServices);
  item?.focus?.();
}

async function inspectUnderCursor(store, adapterServices = null) {
  await openOrShowDock(INSPECTOR_URI);
  setInspector(store, adapterServices);
}

async function setInspector(store, adapterServices = null) {
  if (!store) {
    return;
  }
  if (adapterServices && require("./adapter-integration").setAdapterInspector(adapterServices)) {
    return;
  }
  const { editor, kernel } = store;
  if (!editor || !kernel) {
    inspectorStore.setError("No kernel running!");
    return;
  }
  const code = getExpressionAtCursor(editor);
  if (!code) {
    inspectorStore.setError("No code to introspect!");
    return;
  }
  log("Inspector: Inspecting:", code);
  inspectorStore.load(kernel, code);
}

function toggleOutputMode() {
  // There should never be more than one instance of OutputArea
  const outputArea = atom.workspace
    .getPaneItems()
    .find((paneItem) => paneItem instanceof OutputPane);
  if (outputArea) {
    return outputArea.destroy();
  } else {
    openOrShowDock(OUTPUT_AREA_URI);
  }
}

module.exports = {
  toggleOutputMode,
  showInspector,
  inspectUnderCursor,
  setInspector,
};

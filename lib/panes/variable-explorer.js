const { VARIABLE_EXPLORER_URI } = require("../utils");
const VariableExplorer = require("../components/variable-explorer");
const BasePane = require("./base-pane");

class VariableExplorerPane extends BasePane {
  constructor(store) {
    super({
      title: "Variables",
      iconName: "database",
      uri: VARIABLE_EXPLORER_URI,
      defaultLocation: "right",
      allowedLocations: ["left", "right"],
      component: new VariableExplorer({ store }),
    });
  }
}

module.exports = VariableExplorerPane;

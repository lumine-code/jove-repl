const { WATCHES_URI } = require("../utils");
const Watches = require("../components/watch-sidebar");
const BasePane = require("./base-pane");

class WatchesPane extends BasePane {
  constructor(store) {
    super({
      title: "Watches",
      iconName: "eye-watch",
      uri: WATCHES_URI,
      defaultLocation: "right",
      allowedLocations: ["left", "right"],
      component: new Watches({ store }),
    });
  }
}

module.exports = WatchesPane;

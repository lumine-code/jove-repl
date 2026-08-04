// `status-bar.js` exports its consumer alongside the class, so Babel leaves
// the default under `.default` rather than on `module.exports`.
const statusBar = require("./status-bar/status-bar").default;
const { autocompleteConsumer: autocomplete } = require("./autocomplete");

module.exports = { statusBar, autocomplete };

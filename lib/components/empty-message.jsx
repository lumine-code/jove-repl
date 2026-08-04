/** What a panel shows when there is nothing to display in it yet. */
const etch = require("@lumine-code/etch"); // JSX factory
function renderEmptyMessage() {
  return (
    <background-tips>
      <ul className="centered background-message">
        <li>No output to display</li>
      </ul>
    </background-tips>
  );
}

module.exports = { renderEmptyMessage };

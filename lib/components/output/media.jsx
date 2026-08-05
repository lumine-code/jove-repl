/** @jsx etch.dom */
const etch = require("@lumine-code/etch"); // JSX factory
const { ansiNodes, truncateOutput } = require("../../ansi-utils");

// Each renderer takes the decoded data for its media type and returns virtual
// nodes. They are plain functions, not etch components: etch invokes a function
// tag with `new`, so only classes can be tags, and none of these hold state.

/** Plain text with ANSI colour support. */
function Plain(data) {
  if (data == null) return null;
  const rawText = typeof data === "string" ? data : String(data);

  // Truncate to prevent crashes from large outputs
  const { text, truncated } = truncateOutput(rawText);

  return (
    <div>
      <pre className="output-text">{ansiNodes(text)}</pre>
      {truncated ? <div className="output-truncated">... output truncated</div> : null}
    </div>
  );
}

/**
 * Basic HTML renderer. The result view uses the richer `result-view/html`
 * component instead, which also pulls Vega specs out of Altair output.
 */
function HTML(data) {
  if (!data) return null;
  // Strip script tags for basic safety
  const sanitized = typeof data === "string" ? data.replace(/<script[\s\S]*?<\/script>/gi, "") : "";
  return <div className="output-html" innerHTML={sanitized} />;
}

/**
 * Image renderer for png, jpeg and gif. Data is base64; metadata may carry the
 * width and height set by IPython.display.Image, as a number of pixels or as a
 * string with its own unit.
 */
function image(mediaType) {
  return (data, metadata) => {
    if (!data) return null;
    const src = `data:${mediaType};base64,${data}`;

    const style = { maxWidth: "100%" };
    if (metadata) {
      if (metadata.width) {
        style.width = typeof metadata.width === "number" ? `${metadata.width}px` : metadata.width;
      }
      if (metadata.height) {
        style.height =
          typeof metadata.height === "number" ? `${metadata.height}px` : metadata.height;
      }
    }

    return <img className="output-image" src={src} alt="Output" style={style} draggable={false} />;
  };
}

function SVG(data) {
  if (!data) return null;
  return <div className="output-svg" innerHTML={data} />;
}

/** Pretty-printed JSON. */
function Json(data) {
  if (data == null) return null;
  const rawFormatted = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const { text: formatted, truncated } = truncateOutput(rawFormatted);
  return (
    <div>
      <pre className="output-json">{formatted}</pre>
      {truncated ? <div className="output-truncated">... output truncated</div> : null}
    </div>
  );
}

function JavaScript(data) {
  if (!data) return null;
  return <pre className="output-javascript">{data}</pre>;
}

module.exports = {
  Plain,
  HTML,
  SVG,
  Json,
  JavaScript,
  image,
};

/** @babel */
/** @jsx React.createElement */

/**
 * LaTeX component using MathJax 4 for rendering.
 *
 * MathJax is loaded lazily and asynchronously from the ESM (`mjs`) build of
 * `@mathjax/src` via dynamic `import()`, so the large component modules load off
 * the render path the first time LaTeX output appears (the component shows a
 * "Rendering…" placeholder meanwhile) instead of blocking the UI with a
 * synchronous require. The headless `liteAdaptor` + SVG output produce an SVG
 * string we inject directly.
 */
import React from "react";

// Memoized initialization promise; resolves to { adaptor, htmlDoc }. Reset to
// null on failure so a later render can retry.
let mjPromise = null;

function ensureMathJax() {
  if (mjPromise) return mjPromise;

  mjPromise = (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] =
      await Promise.all([
        import("@mathjax/src/mjs/mathjax.js"),
        import("@mathjax/src/mjs/input/tex.js"),
        import("@mathjax/src/mjs/output/svg.js"),
        import("@mathjax/src/mjs/adaptors/liteAdaptor.js"),
        import("@mathjax/src/mjs/handlers/html.js"),
      ]);

    // TeX packages register themselves as import side effects (v4 requires
    // explicit registration).
    await Promise.all([
      import("@mathjax/src/mjs/input/tex/base/BaseConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/action/ActionConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/color/ColorConfiguration.js"),
    ]);

    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);

    const tex = new TeX({
      packages: ["base", "ams", "newcommand", "action", "color"],
    });
    const svg = new SVG({
      fontCache: "local",
      linebreaks: { inline: false, width: "100000em" }, // Disable line-breaking
    });
    const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: svg });

    return { adaptor, htmlDoc };
  })().catch((err) => {
    console.error("MathJax initialization error:", err);
    mjPromise = null;
    throw err;
  });

  return mjPromise;
}

// Strip math delimiters from LaTeX string
function stripDelimiters(latex) {
  let stripped = latex.trim();

  // Check for multiple equation environments - extract and combine them
  const envPattern =
    /\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?)\}([\s\S]*?)\\end\{\1\}/g;
  const envMatches = [...stripped.matchAll(envPattern)];

  if (envMatches.length > 1) {
    // Multiple environments - combine contents into gathered
    const contents = envMatches.map((m) => m[2].trim());
    return {
      math: "\\begin{gathered}" + contents.join(" \\\\ ") + "\\end{gathered}",
      displayMode: true,
    };
  }

  if (envMatches.length === 1) {
    // Single environment - just extract content
    return { math: envMatches[0][2].trim(), displayMode: true };
  }

  // Check for multiple $...$ or $$...$$ blocks
  const inlineMathPattern = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  const mathMatches = [...stripped.matchAll(inlineMathPattern)];

  if (mathMatches.length > 1) {
    // Multiple inline/display math blocks - combine into gathered
    const contents = mathMatches.map((m) => (m[1] || m[2]).trim());
    return {
      math: "\\begin{gathered}" + contents.join(" \\\\ ") + "\\end{gathered}",
      displayMode: true,
    };
  }

  // Remove display math delimiters
  if (stripped.startsWith("$$") && stripped.endsWith("$$")) {
    return { math: stripped.slice(2, -2), displayMode: true };
  }
  if (stripped.startsWith("\\[") && stripped.endsWith("\\]")) {
    return { math: stripped.slice(2, -2), displayMode: true };
  }

  // Remove inline math delimiters
  if (stripped.startsWith("$") && stripped.endsWith("$") && stripped.length > 2) {
    return { math: stripped.slice(1, -1), displayMode: false };
  }
  if (stripped.startsWith("\\(") && stripped.endsWith("\\)")) {
    return { math: stripped.slice(2, -2), displayMode: false };
  }

  // No math delimiters found - treat as plain text
  return { math: null, isTextMode: true, original: stripped };
}

// Render LaTeX to an SVG string using an initialized MathJax api.
function renderToSvg(api, latex, displayMode) {
  const node = api.htmlDoc.convert(latex, { display: displayMode });
  return api.adaptor.innerHTML(node);
}

/**
 * Strip delimiters, ensure MathJax is loaded, and render LaTeX to an SVG string.
 * Returns `{ textContent }` for non-math input or `{ svg, displayMode }` for
 * math. Exposed for tests so the async ESM load + render path can be exercised
 * headlessly (the liteAdaptor needs no browser DOM).
 */
export async function renderLatexToSvg(latex) {
  const result = stripDelimiters(latex || "");
  if (result.isTextMode) {
    return { textContent: result.original };
  }
  const api = await ensureMathJax();
  return {
    svg: renderToSvg(api, result.math, result.displayMode),
    displayMode: result.displayMode,
  };
}

export class LaTeX extends React.Component {
  static defaultProps = {
    data: "",
    mediaType: "text/latex",
  };

  constructor(props) {
    super(props);
    this.state = {
      svg: null,
      error: null,
    };
    this._mounted = false;
    // Increments per render request so a slow async render can detect that a
    // newer request (or an unmount) has superseded it and skip its setState.
    this._renderToken = 0;
  }

  componentDidMount() {
    this._mounted = true;
    this.renderLatex();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.data !== this.props.data) {
      this.renderLatex();
    }
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  async renderLatex() {
    const token = ++this._renderToken;
    try {
      const out = await renderLatexToSvg(this.props.data || "");
      if (!this._mounted || token !== this._renderToken) return;
      this.setState({
        svg: out.svg || null,
        displayMode: out.displayMode,
        textContent: out.textContent || null,
        error: null,
      });
    } catch (err) {
      console.error("MathJax rendering error:", err);
      if (!this._mounted || token !== this._renderToken) return;
      this.setState({
        svg: null,
        textContent: null,
        error: err.message || "MathJax failed to initialize",
      });
    }
  }

  render() {
    const latex = this.props.data || "";

    // MathJax error - show original LaTeX
    if (this.state.error) {
      return (
        <div className="latex-display latex-error">
          <code style={{ color: "#cc0000" }}>{latex}</code>
        </div>
      );
    }

    // Text-mode LaTeX (no math) - show as preformatted text
    if (this.state.textContent) {
      return (
        <div className="latex-display latex-text-mode">
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
            {this.state.textContent}
          </pre>
        </div>
      );
    }

    // Successfully rendered math
    if (this.state.svg) {
      const style = this.state.displayMode ? { textAlign: "center", margin: "0.5em 0" } : {};

      return (
        <div
          className="latex-display"
          style={style}
          dangerouslySetInnerHTML={{ __html: this.state.svg }}
        />
      );
    }

    // Loading state
    return (
      <div className="latex-display">
        <span style={{ color: "#888" }}>Rendering...</span>
      </div>
    );
  }
}

export default LaTeX;

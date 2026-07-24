/** @babel */
/* global describe, it, expect */

import { renderLatexToSvg } from "../lib/components/result-view/latex";

// Exercises the async ESM MathJax load path end to end: `renderLatexToSvg`
// dynamically imports the `mjs` build of `@mathjax/src` and renders through the
// headless liteAdaptor, so it needs no browser DOM and runs in the spec env.
describe("LaTeX MathJax rendering (async ESM load)", () => {
  it("loads MathJax from the ESM build and renders inline TeX to an SVG string", async () => {
    const out = await renderLatexToSvg("$x^2 + 1$");
    expect(out.svg).toContain("<svg");
    expect(out.displayMode).toBe(false);
  });

  it("renders display math from $$...$$", async () => {
    const out = await renderLatexToSvg("$$\\frac{1}{2}$$");
    expect(out.svg).toContain("<svg");
    expect(out.displayMode).toBe(true);
  });

  it("uses an AMS-package construct without erroring", async () => {
    const out = await renderLatexToSvg("$$\\begin{align} a &= b \\end{align}$$");
    expect(out.svg).toContain("<svg");
  });

  it("returns text mode for input without math delimiters", async () => {
    const out = await renderLatexToSvg("just plain text");
    expect(out.textContent).toBe("just plain text");
    expect(out.svg).toBeUndefined();
  });
});

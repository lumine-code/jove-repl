const etch = require("@lumine-code/etch");
const { CompositeDisposable } = require("atom");
const { renderRichMedia } = require("./output");
const media = require("./output/media");
const { markdownRenderer } = require("./result-view/markdown");
const { autocompleteConsumer } = require("../services/consumed/autocomplete");

// An inspection bundle only ever carries these three, so the panel renders a
// smaller set than a result does.
const INSPECTOR_RENDERERS = {
  "text/html": media.HTML,
  "text/markdown": markdownRenderer,
  "text/plain": media.Plain,
};

function renderMessage(children) {
  return <div className="inspector-message">{children}</div>;
}

function clearExpressionOrAbortMultiCursor(editor, onChange, event) {
  if ((editor.getCursors?.().length || 0) > 1 || (editor.getSelections?.().length || 0) > 1) {
    event?.abortKeyBinding?.();
    return;
  }
  editor.setText("");
  onChange("");
}

/** The expression field: a real mini editor, so it gets completion and a grammar. */
class InspectorExpressionEditor {
  constructor(props) {
    this.props = props;
    etch.initialize(this);

    this.editor = atom.workspace.buildTextEditor({
      softWrapped: true,
      lineNumberGutterVisible: false,
      placeholderText: "Expression to inspect",
    });
    this.editor.element.classList.add("inspector-expression");
    if (this.props.grammar) {
      atom.grammars.assignLanguageMode(this.editor.getBuffer(), this.props.grammar.scopeName);
    }
    if (this.props.value) {
      this.editor.setText(this.props.value);
    }
    this.element.appendChild(this.editor.element);
    autocompleteConsumer.watchPanelEditor(this.editor);

    this.disposables = new CompositeDisposable(
      this.editor.onDidChange(() => this.props.onChange(this.editor.getText())),
      atom.commands.add(this.editor.element, {
        "core:confirm": () => this.props.onConfirm(this.editor.getText()),
        "core:cancel": (event) =>
          clearExpressionOrAbortMultiCursor(this.editor, this.props.onChange, event),
        "jupyter-repl:inspector-focus-body": () => this.props.onFocusBody?.(),
      }),
    );
  }

  focus() {
    this.editor?.element?.focus();
  }

  render() {
    return <div className="inspector-expression-editor" />;
  }

  update(props) {
    const previousGrammar = this.props.grammar;
    this.props = props;

    if (this.editor && this.editor.getText() !== props.value) {
      this.editor.setText(props.value || "");
    }
    const scopeName = props.grammar?.scopeName;
    if (this.editor && scopeName && scopeName !== previousGrammar?.scopeName) {
      atom.grammars.assignLanguageMode(this.editor.getBuffer(), scopeName);
    }
    return etch.update(this);
  }

  destroy() {
    this.disposables.dispose();
    this.editor?.destroy();
    return etch.destroy(this);
  }
}

/** The kernel's introspection of the current expression. */
class Inspector {
  constructor({ inspectorStore }) {
    this.inspectorStore = inspectorStore;
    etch.initialize(this);

    this.disposables = new CompositeDisposable(
      this.inspectorStore.onDidUpdate(() => etch.update(this)),
      atom.commands.add(this.refs.body, {
        "jupyter-repl:inspector-focus-expression": () => this.focusExpression(),
      }),
    );
  }

  focusExpression = () => {
    this.refs.expression?.focus();
  };

  focusBody = () => {
    this.refs.body?.focus({ preventScroll: true });
  };

  renderResult() {
    const store = this.inspectorStore;

    if (store.loading) {
      return renderMessage("Loading...");
    }
    if (store.error) {
      return renderMessage(<span className="text-error">{store.error}</span>);
    }

    const bundle = store.bundle;
    if (!bundle) {
      return renderMessage("No inspection loaded.");
    }
    if (!bundle["text/html"] && !bundle["text/markdown"] && !bundle["text/plain"]) {
      return renderMessage("No inspection bundle.");
    }

    return (
      <div
        className="inspector-result native-key-bindings"
        tabIndex={-1}
        style={{ fontSize: atom.config.get("jupyter-repl.outputAreaFontSize") || "inherit" }}
      >
        {renderRichMedia(bundle, null, INSPECTOR_RENDERERS)}
      </div>
    );
  }

  render() {
    const store = this.inspectorStore;
    return (
      <div className="inspector-panel">
        <div className="inspector-controls">
          <InspectorExpressionEditor
            ref="expression"
            value={store.expression}
            onChange={store.setExpression}
            onConfirm={store.loadExpression}
            grammar={store.kernel && store.kernel.grammar}
            onFocusBody={this.focusBody}
          />
        </div>
        <div className="inspector-body" ref="body" tabIndex={0}>
          {this.renderResult()}
        </div>
      </div>
    );
  }

  update() {
    return etch.update(this);
  }

  destroy() {
    this.disposables.dispose();
    return etch.destroy(this);
  }
}

module.exports = Inspector;

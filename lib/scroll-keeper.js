/** @babel */

export function preserveScroll(editor, callback) {
  if (!editor) {
    return callback();
  }

  if (editor.emitter) {
    const request = { handled: false, perform: callback };
    editor.emitter.emit("scroll-keeper-requested", request);
    if (request.handled) {
      return;
    }
  }

  return callback();
}

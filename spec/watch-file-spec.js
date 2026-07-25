/** @babel */

import { watchFile } from "atom";
import fs from "fs";
import os from "os";
import path from "path";

// The store's `addFileDisposer` used to build a synchronous `new File(path)`
// (backed by the removed `pathwatcher`) and subscribe to `onDidDelete`. Lumine
// replaced that with the async `watchFile`. These specs pin the parts of the
// `watchFile` contract the store depends on. The handle exposes its `emitter`
// specifically so callers can synthesize events without depending on real
// filesystem timing, which keeps this spec deterministic on CI.
describe("watchFile (kernel-file watcher migration)", () => {
  let dir, file, handle;

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jupyter-repl-watch-")));
    file = path.join(dir, "notebook.py");
    fs.writeFileSync(file, "print('hi')\n");
  });

  afterEach(() => {
    if (handle) {
      handle.dispose();
      handle = null;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("is exported from the atom module as a function", () => {
    expect(typeof watchFile).toBe("function");
  });

  it("returns a handle with onDidDelete and dispose", () => {
    handle = watchFile(file);
    expect(typeof handle.onDidDelete).toBe("function");
    expect(typeof handle.dispose).toBe("function");
    expect(typeof handle.getStartPromise).toBe("function");
  });

  it("fires onDidDelete so the store can drop the kernel mapping", () => {
    handle = watchFile(file);
    let deleted = 0;
    const sub = handle.onDidDelete(() => {
      deleted += 1;
    });

    handle.emitter.emit("did-delete");
    expect(deleted).toBe(1);

    // Disposing the subscription stops further notifications, mirroring how the
    // store tears the watcher down inside its file disposer.
    sub.dispose();
    handle.emitter.emit("did-delete");
    expect(deleted).toBe(1);
  });

  it("arms without throwing and resolves its start promise", async () => {
    handle = watchFile(file);
    await handle.getStartPromise();
  });
});

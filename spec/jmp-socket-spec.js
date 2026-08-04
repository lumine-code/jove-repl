const { Socket } = require("../lib/jmp");

// zeromq's Observer binds `inproc://zmq.monitor.<its own heap address>`, and a
// socket lingering from a shut-down kernel keeps its monitor name registered
// while the allocator reuses the freed address for the next kernel's observer.
// Constructing the observer then throws "Address already in use" — which used
// to escape connect() and fail the whole kernel launch. Monitoring is
// telemetry; it must degrade, never veto.

// Built around the prototype rather than the constructor: constructing a real
// zeromq socket inside a spec renderer dies natively (0xC0000005) — the same
// crash that kills kernel starts under the drive harness.
function bareSocket() {
  const socket = Object.create(Socket.prototype);
  socket._jmp = { scheme: "sha256", key: "spec-key", _listeners: new Map() };
  socket._socketType = "dealer";
  socket._receiveLoop = null;
  socket._events = null;
  socket._closed = false;
  socket._connectionState = "disconnected";
  socket._connectedAddresses = new Set();
  socket._lastError = null;
  socket._eventLoopStarted = false;
  return socket;
}

describe("jmp socket connection monitoring", () => {
  let socket;

  beforeEach(() => {
    socket = bareSocket();
  });

  function fakeZmqSocket(eventsBehaviour) {
    return {
      connect() {},
      close() {},
      get events() {
        return eventsBehaviour();
      },
    };
  }

  it("still connects when the observer cannot be constructed at all", () => {
    socket._socket = fakeZmqSocket(() => {
      throw new Error("Failed to construct 'Observer': Address already in use");
    });

    expect(() => socket.connect("inproc://spec-endpoint")).not.toThrow();
    expect(socket._eventLoopStarted).toBe(false);
    expect(socket._connectedAddresses.has("inproc://spec-endpoint")).toBe(true);
  });

  it("retries once, because a second observer gets a fresh address", () => {
    let attempts = 0;
    const events = {
      close() {},
      [Symbol.asyncIterator]() {
        return { next: () => Promise.resolve({ done: true }) };
      },
    };
    socket._socket = fakeZmqSocket(() => {
      attempts++;
      if (attempts === 1) {
        throw new Error("Failed to construct 'Observer': Address already in use");
      }
      return events;
    });

    expect(() => socket.connect("inproc://spec-endpoint")).not.toThrow();
    expect(attempts).toBe(2);
    expect(socket._eventLoopStarted).toBe(true);
    expect(socket._events).toBe(events);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { bindInputRelease, createHeldInputs } from "./held-inputs.ts";

function setup() {
  const keys = new Set();
  const input = createHeldInputs(keys);
  const target = Object.assign(new EventTarget(), { document: new EventTarget() });
  const dispose = bindInputRelease(input, target);
  const send = (type, properties = {}) =>
    target.dispatchEvent(Object.assign(new Event(type), properties));
  return { keys, input, target, send, dispose };
}

test("release outside the steering button stops steering without releasing the pedal", () => {
  const { keys, input, send, dispose } = setup();
  input.pressPointer(1, "a", "touch");
  input.pressPointer(2, "w", "touch");
  send("pointerup", { pointerId: 1 });
  assert.deepEqual([...keys], ["w"]);
  send("pointerup", { pointerId: 2 });
  assert.equal(keys.size, 0);
  dispose();
});

test("cancel, lost capture, and movement without a pressed button release steering", () => {
  for (const type of ["pointercancel", "lostpointercapture", "pointermove"]) {
    const { keys, input, send, dispose } = setup();
    input.pressPointer(7, "d", "touch");
    send(type, { pointerId: 7, buttons: 0 });
    assert.equal(keys.size, 0, type);
    dispose();
  }
});

test("native touch release recovers from a missing pointerup", () => {
  for (const type of ["touchend", "touchcancel"]) {
    const { keys, input, send, dispose } = setup();
    input.pressPointer(1, "a", "touch");
    input.pressPointer(2, "w", "touch");
    send(type, { touches: [{}] });
    assert.equal(keys.size, 2, "other fingers are still held");
    send(type, { touches: [] });
    assert.equal(keys.size, 0, type);
    dispose();
  }
});

test("releasing an unrelated finger does not cancel steering", () => {
  const { keys, input, send, dispose } = setup();
  input.pressPointer(1, "d", "touch");
  send("pointerup", { pointerId: 2 });
  send("lostpointercapture", { pointerId: 2 });
  assert.equal(keys.has("d"), true);
  send("pointerup", { pointerId: 1 });
  assert.equal(keys.size, 0);
  dispose();
});

test("keyboard and multiple fingers keep independent ownership of a held control", () => {
  const { keys, input, dispose } = setup();
  input.pressKey("a");
  input.pressPointer(1, "a", "touch");
  input.pressPointer(2, "a", "touch");
  input.releaseKey("a");
  input.releasePointer(1);
  assert.equal(keys.has("a"), true);
  input.releasePointer(2);
  assert.equal(keys.size, 0);
  input.pressKey("d");
  input.pressPointer(3, "d", "touch");
  input.releasePointer(3);
  assert.equal(keys.has("d"), true);
  input.releaseKey("d");
  assert.equal(keys.size, 0);
  dispose();
});

test("app interruptions clear held inputs and allow the next press", () => {
  for (const type of ["blur", "pagehide", "orientationchange", "contextmenu", "visibilitychange"]) {
    const { keys, input, target, send, dispose } = setup();
    input.pressKey("shift");
    input.pressPointer(1, "a", "touch");
    if (type === "visibilitychange") target.document.dispatchEvent(new Event(type));
    else send(type);
    assert.equal(keys.size, 0, type);
    input.pressPointer(2, "d", "touch");
    send("pointerup", { pointerId: 2 });
    assert.equal(keys.size, 0, "a later press releases normally");
    dispose();
  }
});

test("cleanup clears input and removes global listeners", () => {
  const { keys, input, send, dispose } = setup();
  input.pressPointer(1, "a", "touch");
  dispose();
  assert.equal(keys.size, 0);
  input.pressPointer(2, "d", "touch");
  send("pointerup", { pointerId: 2 });
  assert.equal(keys.has("d"), true);
});

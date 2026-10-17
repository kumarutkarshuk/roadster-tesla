import assert from "node:assert/strict";
import test from "node:test";
import { pedalSpeed, slowDown, steeringRate, chaseDistance } from "./driving.ts";

// Holding S must stop a moving car before reversing, even when boost is held.
test("brake reaches rest before reverse and reverse has a safe speed limit", () => {
  let speed = 72;
  let stopped = false;
  for (let i = 0; i < 600; i++) {
    speed = pedalSpeed(speed, 1 / 60, false, true, true, true);
    if (speed === 0) stopped = true;
    if (speed < 0) assert.ok(stopped);
    assert.ok(speed >= -35);
  }
  assert.equal(speed, -35);
});

// Releasing reverse coasts to rest; W brakes first and then drives forwards.
test("reverse release and forward pedal cannot jump through rest", () => {
  let speed = -35;
  for (let i = 0; i < 500; i++) speed = pedalSpeed(speed, 1 / 60, false, false, false, false);
  assert.equal(Math.abs(speed), 0);
  speed = -35;
  let stopped = false;
  for (let i = 0; i < 180; i++) {
    speed = pedalSpeed(speed, 1 / 60, true, false, false, false);
    if (speed === 0) stopped = true;
    if (speed > 0) assert.ok(stopped);
  }
  assert.ok(speed > 0);
  assert.equal(slowDown(-10, 3), -7);
  assert.equal(Math.abs(slowDown(-1, 3)), 0);
});

// The same steering input must turn the nose in opposite directions when reversing.
test("steering remains symmetric in forward and reverse", () => {
  assert.equal(steeringRate(-30, 1), -steeringRate(30, 1));
  assert.equal(Math.abs(steeringRate(0, 1)), 0);
  assert.ok(Math.abs(steeringRate(-35, 1)) < 1.2);
});

// Boost may widen the view slightly but must never create an unbounded chase gap.
test("camera gap stays close at all speeds and in both screen layouts", () => {
  for (const portrait of [false, true]) {
    const rest = chaseDistance(0, portrait);
    for (const speed of [-35, 0, 72, 180, 265, 1000]) {
      const gap = chaseDistance(speed, portrait);
      assert.ok(gap >= rest && gap <= rest + 2);
    }
    assert.ok(chaseDistance(72, portrait) > rest);
  }
});

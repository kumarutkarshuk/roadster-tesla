import assert from "node:assert/strict";
import test from "node:test";
import { center, elevation, ground, drivingSurface, ROAD_HALF_WIDTH, SHOULDER_HALF_WIDTH } from "./terrain.ts";
import { GUARDRAIL, resolveGuardrail } from "./guardrail.ts";

// All six lanes must remain road surface, including lanes outside the old narrow road.
test("wide highway lanes and shoulders match the visible road height", () => {
  for (const environment of ["coast", "cyber"])
    for (const t of [-80, 80, 320, 800]) {
      for (const offset of [-ROAD_HALF_WIDTH, -7.6, -3.8, 0, 3.8, 7.6, ROAD_HALF_WIDTH])
        assert.ok(Math.abs(drivingSurface(t, center(t) + offset, environment) - elevation(t) - 0.05) < 1e-8);
      assert.ok(Math.abs(drivingSurface(t, center(t) + SHOULDER_HALF_WIDTH, environment) - elevation(t) - 0.02) < 1e-8);
    }
});

// The old rail position must be open road; the new outside rail still protects the car.
test("guardrail protects the wide shoulder without blocking the new lanes", () => {
  const state = { previousX: -4, previousDistance: 80, x: -4, distance: 80, heading: 0, baseY: 0, pitch: 0, roll: 0, speed: 72 };
  assert.equal(resolveGuardrail(state, () => 0, () => 0).hit, false);
  const hit = resolveGuardrail({ ...state, x: GUARDRAIL.center }, () => 0, () => 0);
  assert.equal(hit.hit, true);
  assert.ok(hit.x > GUARDRAIL.center);
  assert.equal(resolveGuardrail({ ...state, x: GUARDRAIL.center, baseY: 5 }, () => 0, () => 0).hit, false);
});

// The ocean stays on the left; city plots stay level with the boulevard.
test("coastal ocean and city plots remain distinct along the journey", () => {
  for (const t of [0, 400, 1200, 4000]) {
    assert.ok(ground(t, -120, "coast") < -5);
    assert.ok(ground(t, 120, "coast") >= elevation(t) - 0.15);
    assert.equal(ground(t, -120, "cyber"), ground(t, 120, "cyber"));
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { airTurn, verticalFlight } from "./flight.ts";

// Landing from low and high flight must finish, touch down gently, and shut the jets off.
test("landing assist settles promptly without bouncing or hovering forever", () => {
  for (const dt of [1 / 120, 1 / 60, 0.05]) {
    for (const initial of [1, 7, 50, 300]) {
      let height = initial, velocity = 0, elapsed = 0, impactSpeed = 0, thrust = 0;
      while (height > 0 && elapsed < 40) {
        const next = verticalFlight(height, velocity, 0, false, dt);
        if (next.height === 0) impactSpeed = Math.abs(velocity);
        ({ height, velocity, thrust } = next);
        assert.ok(height >= 0 && velocity <= 0);
        elapsed += dt;
      }
      assert.equal(height, 0);
      assert.equal(thrust, 0);
      assert.ok(impactSpeed < 1, `touchdown speed ${impactSpeed}`);
      assert.ok(elapsed < initial / 12 + 5);
    }
  }
});

// Releasing steering uses opposite nozzles to brake rotation, with no instant yaw jump.
test("air turns build smoothly and counter-thrust settles the car", () => {
  for (const direction of [-1, 1]) {
    let rate = 0, jet = 0;
    const first = airTurn(rate, jet, direction * 0.7, 1 / 60);
    assert.ok(Math.abs(first.rate) < 0.01);
    for (let i = 0; i < 180; i++) ({ rate, jet } = airTurn(rate, jet, direction * 0.7, 1 / 60));
    assert.equal(Math.sign(rate), direction);
    assert.equal(Math.sign(jet), -direction);
    let brakingJet = false;
    for (let i = 0; i < 180; i++) {
      ({ rate, jet } = airTurn(rate, jet, 0, 1 / 60));
      if (Math.sign(jet) === direction) brakingJet = true;
    }
    assert.ok(brakingJet);
    assert.ok(Math.abs(rate) < 0.001 && Math.abs(jet) < 0.001);
  }
});

// Switching back to flight during descent must recover lift instead of forcing a landing.
test("landing can be cancelled and hover remains stable", () => {
  let height = 5, velocity = -4;
  for (let i = 0; i < 600; i++) ({ height, velocity } = verticalFlight(height, velocity, 7, true, 1 / 60));
  assert.ok(Math.abs(height - 7) < 0.01);
  assert.ok(Math.abs(velocity) < 0.01);
});

import test from "node:test";
import assert from "node:assert/strict";
import { destinationPosition, planetRadius } from "./journey.ts";

// The globe must grow continuously and remain in view instead of dipping below the screen.
test("destinations stay visible and only grow throughout the approach", () => {
  for (const planet of ["earth", "moon", "mars"]) {
    const radius = planetRadius[planet];
    let previousDistance = Infinity;
    for (let i = 0; i <= 1000; i++) {
      const [x,y,z] = destinationPosition(planet, i / 1000);
      const distance = Math.hypot(x,y,z);
      const upperEdge = Math.asin(-y / distance) + Math.asin(radius / distance);
      assert.ok(distance <= previousDistance);
      assert.ok(distance > radius);
      // A level 52-degree camera retains the upper edge even during the final descent turn.
      assert.ok(upperEdge > -26 * Math.PI / 180);
      previousDistance = distance;
    }
  }
});

// Switching worlds preserves the exact landing position and incoming vertical velocity.
test("travel meets the landing horizon without a position or speed jump", () => {
  for (const planet of ["earth", "moon", "mars"]) {
    const end = destinationPosition(planet, 1);
    assert.ok(Math.hypot(end[0],end[2]) < 1e-9);
    assert.equal(end[1], planetRadius[planet] + 180);
    const dt = .0001;
    const before = destinationPosition(planet, 1 - .05 * dt);
    assert.ok(Math.abs((end[1] - before[1]) / dt + 12) < .05);
  }
});

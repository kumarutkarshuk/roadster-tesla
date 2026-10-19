import assert from "node:assert/strict";
import test from "node:test";
import { airTurn, verticalFlight, escapeFlight } from "./flight.ts";

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

// A long hold must reach space at similar times on fast and slow screens.
test("held climb accelerates into space and release settles into hover", () => {
  const heights = [];
  for (const dt of [1 / 120, 1 / 60, 0.05]) {
    let height = 7, velocity = 0, held = 0;
    let earlySpeed = 0;
    for (let i = 0; i < Math.round(65 / dt); i++) {
      ({ height, velocity, held } = escapeFlight(height, velocity, 1, held, dt));
      if (i === Math.round(1 / dt)) earlySpeed = velocity;
    }
    assert.ok(height > 100000);
    assert.ok(velocity > earlySpeed * 3 && velocity <= 32000);
    heights.push(height);
    for (let i = 0; i < Math.round(6 / dt); i++)
      ({ height, velocity, held } = escapeFlight(height, velocity, 0, held, dt));
    assert.ok(Math.abs(velocity) < 0.02);
    assert.equal(held, 0);
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) < 1500);
});

// Returning from space must stay finite, slow near Earth, and finish a soft landing.
test("space descent returns safely and a fresh climb restarts gently", () => {
  let height = 150000, velocity = 8000, held = 40;
  for (let i = 0; i < 120 * 60 && height > 0; i++) {
    const step = height > 400
      ? escapeFlight(height, velocity, -1, held, 1 / 60)
      : verticalFlight(height, velocity, 0, false, 1 / 60);
    ({ height, velocity } = step);
    held = step.held ?? 0;
    assert.ok(Number.isFinite(height) && height >= 0);
    if (height === 0) assert.equal(velocity, 0);
  }
  assert.equal(height, 0);
  const restart = escapeFlight(7, 0, 1, held, 1 / 60);
  assert.ok(restart.velocity < 15);
});

// Short holds stay controllable; releasing resets acceleration for the next hold.
test("climb starts slowly and restarts gently after hover", () => {
  for(const dt of [1/120,1/60,.05]) {
    let height=7,velocity=0,held=0;
    for(let elapsed=0;elapsed<3;elapsed+=dt)({height,velocity,held}=escapeFlight(height,velocity,1,held,dt));
    assert.ok(height>25 && height<60);
    for(let elapsed=0;elapsed<6;elapsed+=dt)({height,velocity,held}=escapeFlight(height,velocity,0,held,dt));
    const before=height;
    for(let elapsed=0;elapsed<.5;elapsed+=dt)({height,velocity,held}=escapeFlight(height,velocity,1,held,dt));
    assert.ok(height-before<5);
  }
});

// Climb stays controllable near the city and reaches space only after a sustained hold.
test("climb stays gentle without a sudden speed jump", () => {
  for (const dt of [1/120,1/60,.05,.1,.25]) {
    let height=0,velocity=0,held=0;
    for(let i=0;i<Math.round(1/dt);i++) ({height,velocity,held}=escapeFlight(height,velocity,1,held,dt));
    assert.ok(velocity<20 && height<20);
    for(let i=Math.round(1/dt);i<Math.round(8/dt);i++) ({height,velocity,held}=escapeFlight(height,velocity,1,held,dt));
    assert.ok(height>400 && height<1000);
    assert.ok(velocity<400);
  }
});

// Space climb uses altitude rather than hold time, so resuming E restores fast travel.
test("fast climb starts above 1 km and resumes after hover", () => {
  for (const dt of [1/120, 1/60, .05, .25]) {
    let height=1000, velocity=0, held=0;
    for(let i=0;i<Math.round(6/dt);i++) ({height,velocity,held}=escapeFlight(height,velocity,1,held,dt));
    assert.ok(height>100000);
    for(let i=0;i<Math.round(8/dt);i++) ({height,velocity,held}=escapeFlight(height,velocity,0,held,dt));
    assert.equal(held,0);
    assert.ok(Math.abs(velocity)<.001);
    for(let i=0;i<Math.round(1/dt);i++) ({height,velocity,held}=escapeFlight(height,velocity,1,held,dt));
    assert.ok(velocity>20000 && velocity<=32000);
  }
});

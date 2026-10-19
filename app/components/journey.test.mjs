import test from "node:test";
import assert from "node:assert/strict";
import { advanceJourney, approachPlanet, canApproachPlanet, planetBearing } from "./journey.ts";

// Every world supports another journey, including the trip back to Earth.
test("planet travel completes, pauses on release, and can return to Earth", () => {
  let state = { planet: "earth", destination: null, progress: 0 };
  for (const destination of ["mars", "moon", "earth"]) {
    state = advanceJourney(state, destination, true, 2);
    assert.equal(state.destination, destination);
    const paused = advanceJourney(state, destination, false, 20);
    assert.deepEqual(paused, state);
    for (let i=0;i<600;i++) state = advanceJourney(state,destination,true,.1);
    assert.equal(state.planet,destination);
    assert.equal(state.destination,null);
    assert.equal(state.progress,0);
  }
});

// A visible destination does not replace the departure world halfway through travel.
test("travel preserves the departure world until the continuous approach finishes", () => {
  let state = { planet: "earth", destination: null, progress: 0 };
  state = advanceJourney(state,"moon",false,5);
  assert.equal(state.progress,0);
  state = advanceJourney(state,"moon",true,5);
  assert.equal(state.planet,"earth");
  assert.ok(state.progress > 0 && state.progress < .1);
  for(let i=0;i<600;i++) state = advanceJourney(state,"moon",true,.1);
  assert.equal(state.planet,"moon");
  assert.equal(state.destination,null);
});

// Forward throttle reaches the surface gently; release stops approach without needing a landing button.
test("forward approach lands safely and release brakes to hover", () => {
  for (const dt of [1/120,1/60,.05]) {
    let height=180000, velocity=0;
    for(let elapsed=0;elapsed<180 && height>0;elapsed+=dt) {
      ({height,velocity}=approachPlanet(height,velocity,true,dt));
      assert.ok(Number.isFinite(height) && height>=0);
    }
    assert.equal(height,0);
    assert.equal(velocity,0);
    height=180000; velocity=-8000;
    for(let elapsed=0;elapsed<6;elapsed+=dt)
      ({height,velocity}=approachPlanet(height,velocity,false,dt));
    assert.ok(Math.abs(velocity)<.001 && height>170000);
  }
});

// A short approach press cannot suddenly pull the car into a planet.
test("approach acceleration is bounded on different screens", () => {
  for(const dt of [1/120,1/60,.05]) {
    let height=180000,velocity=0;
    for(let elapsed=0;elapsed<2;elapsed+=dt) {
      const before=velocity;
      ({height,velocity}=approachPlanet(height,velocity,true,dt));
      assert.ok(Math.abs(velocity-before)<=1200*dt+.0001);
    }
    assert.ok(height>177000);
  }
});

// Joining the landing phase preserves descent speed instead of braking at the world switch.
test("arrival carries incoming speed into descent and slows before touchdown", () => {
  for (const dt of [1/120, 1/60, .05]) {
    let height = 180000, velocity = -12000;
    const first = approachPlanet(height, velocity, true, dt);
    assert.equal(first.velocity, velocity);
    assert.ok(first.height < height);
    for (let elapsed = 0; elapsed < 180 && height > 0; elapsed += dt) {
      ({height, velocity} = approachPlanet(height, velocity, true, dt));
      assert.ok(height >= 0);
      if (height < 1) assert.ok(Math.abs(velocity) < 2);
    }
    assert.equal(height, 0);
    assert.equal(velocity, 0);
  }
});

// Entry should feel fast without trading away a gentle touchdown.
test("arrival reaches the ground within 35 seconds with gentle final speed", () => {
  for (const dt of [1/120, 1/60, .05]) {
    let height = 180000, velocity = -12000;
    for (let elapsed = 0; elapsed < 35 && height > 0; elapsed += dt) {
      ({height, velocity} = approachPlanet(height, velocity, true, dt));
      if (height < 1) assert.ok(Math.abs(velocity) < 2);
    }
    assert.equal(height, 0);
    assert.equal(velocity, 0);
  }
});

// A slightly sideways flight keeps progressing, while turning away still stops travel.
test("sideways approaches finish on every world without requiring exact aim", () => {
  for (const planet of ["earth", "moon", "mars"]) {
    const bearing = planetBearing[planet];
    let state = { planet: planet === "earth" ? "moon" : "earth", destination: planet, progress: 0 };
    for (let i=0;i<1000 && state.destination;i++) {
      const heading = bearing + .45;
      assert.ok(canApproachPlanet(planet,heading,state.progress));
      state = advanceJourney(state,planet,canApproachPlanet(planet,heading,state.progress),.1);
    }
    assert.equal(state.planet,planet);
    assert.equal(state.destination,null);
    for (const sign of [-1,1]) {
      assert.ok(canApproachPlanet(planet,bearing+sign*.9,.95));
      assert.ok(canApproachPlanet(planet,bearing+sign*.45+Math.PI*2,0));
      assert.equal(canApproachPlanet(planet,bearing+sign*2,.95),false);
      assert.equal(canApproachPlanet(planet,bearing+sign*.9,0),false);
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { cityBuildings, cityDistricts, sweepScenery } from "./city-layout.ts";

// Flying away from the highway must keep a city ahead, behind and on both sides.
test("district coverage follows long flights and stays bounded", () => {
  for (const [t, offset] of [[80, 5], [4000, 2400], [-3000, -2700]]) {
    const districts = cityDistricts(t, offset);
    const row = Math.floor(t / 160), column = Math.floor(offset / 208);
    const keys = new Set(districts.map(d => d.key));
    assert.equal(keys.size, 165);
    for (const [z, x] of [[-7, 0], [7, 0], [0, -5], [0, 5], [0, 0]])
      assert.ok(keys.has(`${row + z}:${column + x}`));
    assert.equal(districts[0].key, `${row}:${column}`);
    assert.equal(cityBuildings(row, column).length, 16);
  }
});

// Revisited neighbourhoods must have the same towers and leave the highway clear.
test("building addresses remain stable and avoid the highway", () => {
  assert.deepEqual(cityBuildings(4, -3), cityBuildings(4, -3));
  for (const column of [-2, -1, 0, 1])
    for (const b of cityBuildings(0, column))
      assert.ok(Math.abs(b.offset) - b.width / 2 > 23);
});

const tower = { x: 40, y: 50, z: 0, w: 20, h: 100, d: 20 };
// Fast movement must stop outside a facade instead of tunnelling through it.
test("boosting into buildings stops at the wall without lifting onto the roof", () => {
  const hit = sweepScenery({ x: 0, y: 5, z: 0 }, { x: 80, y: 5, z: 0 }, [tower]);
  assert.equal(hit.hit, true);
  assert.ok(hit.x < 27.4);
  assert.equal(hit.y, 5);
  assert.equal(hit.landed, false);
});

// Flying above buildings is free; descending onto their roofs supports the car.
test("flight clears towers and descending lands on roofs", () => {
  assert.equal(sweepScenery({ x: 0, y: 104, z: 0 }, { x: 80, y: 104, z: 0 }, [tower]).hit, false);
  const landed = sweepScenery({ x: 40, y: 120, z: 0 }, { x: 40, y: 90, z: 0 }, [tower]);
  assert.equal(landed.landed, true);
  assert.ok(landed.y >= 100);
  assert.equal(sweepScenery(landed, { ...landed, y: 105 }, [tower]).hit, false);
});

// A narrow trunk still blocks the whole car, even between two physics frames.
test("tree trunks stop cars and nearby clear paths remain usable", () => {
  const trunk = { x: 8, y: 1.5, z: 0, w: 0.5, h: 3, d: 0.5 };
  assert.equal(sweepScenery({ x: 0, y: 0, z: 0 }, { x: 15, y: 0, z: 0 }, [trunk]).hit, true);
  assert.equal(sweepScenery({ x: 0, y: 0, z: 6 }, { x: 15, y: 0, z: 6 }, [trunk]).hit, false);
});

// A normal-width car can pass between trunks even when their leaf crowns overlap.
test("a clear forest gap admits the car but still blocks a direct trunk hit", () => {
  const trunks = [-2, 2].map(x => ({ x, y: 2, z: 0, w: 0.5, h: 4, d: 0.5 }));
  const car = { heading: 0, halfWidth: 1.3, halfLength: 2.5 };
  const start = { x: 0, y: 0, z: 10 }, end = { x: 0, y: 0, z: -10 };
  assert.equal(sweepScenery(start, end, trunks, 2.85, 1.8, car).hit, false);
  assert.equal(sweepScenery({ ...start, x: 2 }, { ...end, x: 2 }, trunks, 2.85, 1.8, car).hit, true);
  const narrowGap = trunks.map(t => ({ ...t, x: t.x * 0.65 }));
  assert.equal(sweepScenery(start, end, narrowGap, 2.85, 1.8, car).hit, true);
});

// Turning the car sideways must rotate its clearance rather than widening every gap.
test("forest gap clearance follows the direction of the car", () => {
  const trunks = [-2, 2].map(z => ({ x: 0, y: 2, z, w: 0.5, h: 4, d: 0.5 }));
  const car = { heading: Math.PI / 2, halfWidth: 1.3, halfLength: 2.5 };
  assert.equal(sweepScenery({ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, trunks, 2.85, 1.8, car).hit, false);
});

// Thin lamp poles must block a fast car without blocking a clear neighbouring lane.
test("street-light-sized poles stop swept car motion", () => {
  const pole={x:0,y:5.5,z:0,w:.18,h:11,d:.18};
  const car={heading:0,halfWidth:1.3,halfLength:2.5};
  assert.equal(sweepScenery({x:0,y:0,z:5},{x:0,y:0,z:-5},[pole],2.85,1.8,car).hit,true);
  assert.equal(sweepScenery({x:3,y:0,z:5},{x:3,y:0,z:-5},[pole],2.85,1.8,car).hit,false);
});

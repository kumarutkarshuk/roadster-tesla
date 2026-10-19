import test from "node:test";
import assert from "node:assert/strict";
import { ascentBlur, flightHeat } from "./ascent.ts";

// Light blur follows either ascent or descent and clears at low speed or in deep space.
test("ascent blur follows speed and fades at both ends of the transition", () => {
  assert.equal(ascentBlur(7, 12, true), 0);
  assert.ok(ascentBlur(20000, 3000, true) > .4);
  assert.equal(ascentBlur(20000, 3000, false), 0);
  assert.equal(ascentBlur(20000, -3000, true), ascentBlur(20000, 3000, true));
  assert.equal(ascentBlur(230000, 8000, true), 0);
  assert.ok(ascentBlur(180000, 8000, true) < ascentBlur(65000, 8000, true));
});

// Ascent heat still needs atmosphere; descent uses the visible gameplay entry effect.
test("friction glow stays subtle and disappears outside atmosphere", () => {
  assert.equal(flightHeat(20000,10000,"moon"),0);
  assert.equal(flightHeat(140000,20000,"earth"),0);
  assert.equal(flightHeat(1000,50,"earth"),0);
  assert.ok(flightHeat(20000,-10000,"earth")>0);
  assert.ok(flightHeat(20000,10000,"mars")<flightHeat(20000,10000,"earth"));
  assert.ok(flightHeat(1000,32000,"earth")<=.65);
});

// The user's slower atmospheric climb must produce visible heat in both directions.
test("flames are visible at normal climbing speeds but absent while hovering", () => {
  assert.ok(flightHeat(2200,493,"earth")>.25);
  assert.equal(flightHeat(2200,0,"earth"),0);
  assert.equal(flightHeat(2200,493,"moon"),0);
  assert.ok(flightHeat(2200,-493,"earth")>0);
});

// Every destination shows entry flames, then fades them out before landing or while hovering.
test("fast entry shows flames from arrival through descent on every planet", () => {
  for (const planet of ["earth", "moon", "mars"]) {
    assert.ok(flightHeat(180000, -12000, planet) > .9);
    assert.ok(flightHeat(20000, -8000, planet) > .9);
    assert.equal(flightHeat(50, -20, planet), 0);
    assert.equal(flightHeat(20000, 0, planet), 0);
    assert.equal(flightHeat(250000, -12000, planet), 0);
  }
});

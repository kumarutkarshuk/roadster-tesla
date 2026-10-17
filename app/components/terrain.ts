// Both drives use a broad six-lane highway with room to recover on the shoulder.
export type TerrainEnvironment = "coast" | "cyber";
export const ROAD_HALF_WIDTH = 11.5;
export const SHOULDER_HALF_WIDTH = 14;
export const CRUISE_LANE = 5.75;

// Gentle bends keep the ocean and skyline visible ahead of the car.
export const center = (t: number) =>
  Math.sin(t / 420) * 48 + Math.sin(t / 970) * 76;
export const elevation = (t: number) =>
  12 + Math.sin(t / 340) * 3 + Math.sin(t / 730) * 4;

// The coast drops into open water on the left; the city has level building plots.
export function ground(t: number, offset: number, environment: TerrainEnvironment) {
  const edge = Math.max(0, Math.abs(offset) - 18);
  if (environment === "cyber") return elevation(t) - 0.15;
  if (offset < -18) return elevation(t) - 0.15 - edge * 0.65;
  // Several gentle landform scales avoid the repeated wave-shaped hills.
  const hills = (Math.sin(t / 310 + offset / 210) * 0.5 + 0.5)
    * (0.4 + 0.6 * Math.sin(offset / 370 - t / 690) ** 2);
  const foothills = Math.sin(t / 91 + offset / 73) * Math.sin(offset / 137 - t / 153);
  const rise = (1 - Math.exp(-edge / 110));
  return elevation(t) - 0.15 + edge * 0.025 + rise * (hills * Math.min(edge * 0.42, 190) + foothills * 4);

}

export const terrainOffsets: number[] = [];
for (let x = -1400; x <= 1400; x += x < -240 || x >= 240 ? 40 : 8)
  terrainOffsets.push(x);

/** Height on the actual two triangles used for each rendered terrain cell. */
export function terrainSurface(
  t: number,
  x: number,
  environment: TerrainEnvironment,
) {
  const t0 = Math.floor(t / 8) * 8;
  const v = (t - t0) / 8;
  const rowCenter = center(t0) * (1 - v) + center(t0 + 8) * v;
  const offset = x - rowCenter;
  const step = offset < -240 || offset >= 240 ? 40 : 8;
  const left = Math.floor((offset + 240) / step) * step - 240;
  const u = (offset - left) / step;
  const a = ground(t0, left, environment),
    b = ground(t0, left + step, environment);
  const c = ground(t0 + 8, left, environment),
    d = ground(t0 + 8, left + step, environment);
  return u + v <= 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export function drivingSurface(
  t: number,
  x: number,
  environment: TerrainEnvironment,
) {
  const t0 = Math.floor(t / 4) * 4,
    v = (t - t0) / 4;
  const roadCenter = center(t0) * (1 - v) + center(t0 + 4) * v;
  const offset = Math.abs(x - roadCenter);
  if (offset <= SHOULDER_HALF_WIDTH)
    return (
      elevation(t0) * (1 - v) +
      elevation(t0 + 4) * v +
      (offset <= ROAD_HALF_WIDTH ? 0.05 : 0.02)
    );
  return terrainSurface(t, x, environment);
}

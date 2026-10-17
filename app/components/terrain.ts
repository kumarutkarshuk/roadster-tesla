export type TerrainEnvironment = "countryside" | "coast" | "alpine" | "desert";

export const center = (t: number) =>
  Math.sin(t / 210) * 48 + Math.sin(t / 470) * 76;
export const elevation = (t: number) =>
  8 + Math.sin(t / 150) * 5 + Math.sin(t / 370) * 7;
export function ground(
  t: number,
  offset: number,
  environment: TerrainEnvironment,
) {
  const edge = Math.max(0, Math.abs(offset) - 12);
  if (environment === "countryside")
    return (
      elevation(t) -
      0.15 +
      (1 - Math.exp(-edge / 45)) *
        (Math.sin(t / 170 + offset / 150) * 5 + Math.sin(offset / 230) * 8) +
      edge * 0.008
    );
  const hills =
    (Math.sin(t / 85 + offset / 69) * 0.5 + 0.5) *
    Math.sin(offset / 130 + t / 230) ** 2;
  if (environment === "coast" && offset < -18)
    return elevation(t) - Math.min(24, edge * 0.24) + hills * edge * 0.08;
  return (
    elevation(t) -
    0.15 +
    edge * 0.055 +
    hills * Math.min(edge * 0.65, environment === "alpine" ? 220 : 120)
  );
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
  if (offset < 4)
    return (
      elevation(t0) * (1 - v) +
      elevation(t0 + 4) * v +
      (offset < 3.5 ? 0.05 : 0.02)
    );
  return terrainSurface(t, x, environment);
}

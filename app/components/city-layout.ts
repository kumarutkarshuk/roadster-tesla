// Districts follow the car in every direction, including flights away from the highway.
export const CITY_BLOCK_LENGTH = 160;
export const CITY_BLOCK_WIDTH = 208;
export const cityRandom = (n: number) => {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
export type CityBuilding = { t: number; offset: number; width: number; height: number; depth: number; accent: number };
export type CityBox = { x: number; y: number; z: number; w: number; h: number; d: number };
export type CityPoint = { x: number; y: number; z: number };
export type CarFootprint = { heading: number; halfWidth: number; halfLength: number };

// Stable addresses keep the same buildings when the player returns to a district.
export function cityBuildings(index: number, column: number): CityBuilding[] {
  const buildings: CityBuilding[] = [];
  const side = column < 0 ? -1 : 1;
  const band = column < 0 ? -column - 1 : column;
  for (let row = 0; row < 4; row++) {
    for (let slot = 0; slot < 4; slot++) {
      const seed = index * 673 + slot * 31 + (band * 4 + row) * 113 + side * 17;
      buildings.push({
        t: index * CITY_BLOCK_LENGTH + slot * 40 + 20,
        offset: side * (40 + (band * 4 + row) * 52),
        width: 21 + cityRandom(seed + 4) * 11,
        height: 24 + cityRandom(seed + 8) ** 1.5 * 170,
        depth: 22 + cityRandom(seed + 10) * 8,
        accent: cityRandom(seed + 13) > 0.74 ? 3 : 2,
      });
    }
  }
  return buildings;
}

// A full ring of districts avoids empty space when looking back or flying sideways.
export function cityDistricts(t: number, offset: number) {
  const row = Math.floor(t / CITY_BLOCK_LENGTH);
  const column = Math.floor(offset / CITY_BLOCK_WIDTH);
  const districts: { row: number; column: number; key: string; priority: number }[] = [];
  for (let z = row - 7; z <= row + 7; z++)
    for (let x = column - 5; x <= column + 5; x++)
      districts.push({ row: z, column: x, key: `${z}:${x}`, priority: (z - row) ** 2 + (x - column) ** 2 });
  return districts.sort((a, b) => a.priority - b.priority);
}

// Swept contact catches walls at boost speed and supports landing on stepped rooftops.
export function sweepScenery(start: CityPoint, end: CityPoint, boxes: CityBox[], radius = 2.85, height = 1.8, footprint?: CarFootprint) {
  // Use the car's width across a gap, rather than its length in every direction.
  const sin = Math.abs(Math.sin(footprint?.heading ?? 0));
  const cos = Math.abs(Math.cos(footprint?.heading ?? 0));
  const radiusX = footprint ? cos * footprint.halfWidth + sin * footprint.halfLength : radius;
  const radiusZ = footprint ? sin * footprint.halfWidth + cos * footprint.halfLength : radius;
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  let first = 1;
  let axis: "x" | "y" | "z" | null = null;
  let sign = 0;
  for (const box of boxes) {
    const min = { x: box.x - box.w / 2 - radiusX, y: box.y - box.h / 2 - height, z: box.z - box.d / 2 - radiusZ };
    const max = { x: box.x + box.w / 2 + radiusX, y: box.y + box.h / 2, z: box.z + box.d / 2 + radiusZ };
    let near = -Infinity, far = Infinity;
    let hitAxis: "x" | "y" | "z" = "y";
    let hitSign = 1;
    for (const key of ["x", "y", "z"] as const) {
      if (Math.abs(delta[key]) < 1e-9) {
        if (start[key] < min[key] || start[key] > max[key]) { far = -Infinity; break; }
      } else {
        const a = (min[key] - start[key]) / delta[key];
        const b = (max[key] - start[key]) / delta[key];
        if (Math.min(a, b) > near) {
          near = Math.min(a, b);
          hitAxis = key;
          hitSign = delta[key] > 0 ? -1 : 1;
        }
        far = Math.min(far, Math.max(a, b));
      }
    }
    if (near >= -1e-7 && near <= far && near <= first) {
      first = Math.max(0, near);
      axis = hitAxis;
      sign = hitSign;
    }
  }
  const point = axis ? {
    x: start.x + delta.x * first,
    y: start.y + delta.y * first,
    z: start.z + delta.z * first,
  } : { ...end };
  if (axis) point[axis] += sign * 0.03;
  return { ...point, hit: axis !== null, landed: axis === "y" && sign > 0, axis };
}

// Match the visible left-side beam and its posts. The right shoulder stays open.
export const GUARDRAIL = { center: -14.4, halfWidth: 0.225, height: 0.95 };

type RailContact = {
  previousX: number;
  previousDistance: number;
  x: number;
  distance: number;
  heading: number;
  baseY: number;
  pitch: number;
  roll: number;
  speed: number;
};

export function resolveGuardrail(
  state: RailContact,
  roadCenter: (distance: number) => number,
  roadHeight: (distance: number) => number,
) {
  let { x, heading, speed } = state;
  const side =
    state.previousX - roadCenter(state.previousDistance) >= GUARDRAIL.center
      ? 1
      : -1;
  const halfWidth = 1.3 + Math.abs(Math.sin(state.roll)) * 0.85;
  const halfLength = 2.5;
  const verticalRadius =
    Math.abs(Math.sin(state.pitch)) * halfLength +
    Math.abs(Math.sin(state.roll)) * 1.3 +
    Math.abs(Math.cos(state.roll)) * 0.85;
  const centerY = state.baseY + Math.cos(state.roll) * 0.85;
  let top = -Infinity,
    bottom = Infinity;
  for (const t of [
    state.distance - halfLength,
    state.distance,
    state.distance + halfLength,
  ]) {
    top = Math.max(top, roadHeight(t) + GUARDRAIL.height);
    bottom = Math.min(bottom, roadHeight(t));
  }
  // Flying over the rail is allowed. Include the whole tilted body, not just
  // the wheel contact point, when deciding whether it clears the rail.
  if (centerY - verticalRadius > top + 0.1 || centerY + verticalRadius < bottom)
    return { x, heading, speed, hit: false };

  const clearance = () => {
    let gap = Infinity;
    for (const forward of [-halfLength, 0, halfLength]) {
      for (const across of [-halfWidth, halfWidth]) {
        const cornerX =
          x + Math.sin(heading) * forward + Math.cos(heading) * across;
        const cornerT =
          state.distance +
          Math.cos(heading) * forward -
          Math.sin(heading) * across;
        gap = Math.min(
          gap,
          side * (cornerX - roadCenter(cornerT) - GUARDRAIL.center),
        );
      }
    }
    return gap - GUARDRAIL.halfWidth - 0.08;
  };
  const overlap = -clearance();
  if (overlap <= 0) return { x, heading, speed, hit: false };
  // Keep the hull on the side it occupied before this step. This also catches
  // a boost step that crosses the entire beam between rendered frames.
  x += side * overlap;
  const tangent = Math.atan2(
    roadCenter(state.distance + 2) - roadCenter(state.distance - 2),
    4,
  );
  const angle = Math.atan2(
    Math.sin(heading - tangent),
    Math.cos(heading - tangent),
  );
  const aligned =
    Math.abs(angle) > Math.PI / 2
      ? tangent + Math.sign(angle) * Math.PI
      : tangent;
  speed *= Math.max(0.15, 1 - Math.abs(Math.sin(angle)) * 0.65) * 0.985;
  heading +=
    Math.atan2(Math.sin(aligned - heading), Math.cos(aligned - heading)) * 0.8;
  // Turning the car changes its projected width; recheck the full hull.
  x += side * Math.max(0, -clearance());
  return { x, heading, speed, hit: true };
}

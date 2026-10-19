export type Planet = "earth" | "moon" | "mars";
export type Journey = { planet: Planet; destination: Planet | null; progress: number };

// Forward throttle closes the distance; the departure world stays active until arrival.
export function advanceJourney(state: Journey, requested: Planet | undefined, forward: boolean, dt: number): Journey {
  const { planet } = state;
  let { destination, progress } = state;
  if (requested && requested !== destination && requested !== planet) {
    destination = requested;
    progress = 0;
  }
  if (!destination || !forward || dt <= 0) return { planet, destination, progress };
  progress = Math.min(1, progress + dt * (.0125 + .0375 * Math.min(1, progress * 4)));
  if (progress >= 1) return { planet: destination, destination: null, progress: 0 };
  return { planet, destination, progress };
}

// W approaches the visible surface; release brakes to a hover, and the final metres slow for landing.
export function approachPlanet(height: number, velocity: number, forward: boolean, dt: number) {
  const target = forward ? -Math.min(12000, Math.sqrt(Math.max(0, height)) * 65, height * .9 + .3) : 0;
  // Fast entry brakes harder near the surface, while throttle still builds speed smoothly.
  const change = (target - velocity) * (1 - Math.exp(-dt * 3));
  const nextVelocity = velocity + (forward ? Math.max(-1200 * dt, Math.min(3000 * dt, change)) : change);
  const safeVelocity = Math.max(nextVelocity, -Math.max(.5, height * 1.5));
  const nextHeight = Math.max(0, height + safeVelocity * dt);
  if (forward && nextHeight < .035) return { height: 0, velocity: 0, thrust: 0 };
  return { height: nextHeight, velocity: safeVelocity, thrust: 9.81 };
}

// Each destination has a stable bearing, so steering and destination buttons agree.
export const planetBearing: Record<Planet, number> = { earth: -2.2, moon: .8, mars: 2.5 };

// Shared planet sizes keep travel and the arrival horizon at the same scale, in kilometres.
export const planetRadius: Record<Planet, number> = { earth: 6371, moon: 1737, mars: 3390 };

// Slight sideways steering still approaches the planet; nearby worlds allow their full visible width.
export function canApproachPlanet(planet: Planet, heading: number, progress: number) {
  const offset = Math.abs(Math.atan2(Math.sin(planetBearing[planet] - heading), Math.cos(planetBearing[planet] - heading)));
  const distance = Math.hypot(...destinationPosition(planet, progress));
  const angularRadius = Math.asin(Math.min(1, planetRadius[planet] / distance));
  const tolerance = Math.min(Math.PI / 2, Math.max(Math.PI / 6, angularRadius + .2));
  return offset <= tolerance;
}

// Keep the destination ahead until it fills the view, then lower it into the landing horizon.
export function destinationPosition(planet: Planet, progress: number): [number, number, number] {
  const radius = planetRadius[planet];
  const p = Math.max(0, Math.min(1, progress)), remaining = 1 - p;
  // Distance only decreases; the endpoint carries 12 km/s into the landing phase.
  const distance = radius + 180 + 240 * remaining + (23 * radius - 420) * remaining * remaining;
  const turn = Math.max(0, Math.min(1, (p - .8) / .2));
  const angle = Math.atan(.15) + (-Math.PI / 2 - Math.atan(.15)) * turn * turn * (3 - 2 * turn);
  const horizontal = Math.cos(angle) * distance;
  const bearing = planetBearing[planet];
  return [-Math.sin(bearing) * horizontal, -Math.sin(angle) * distance, Math.cos(bearing) * horizontal];
}

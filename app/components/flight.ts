// Air nozzles build torque gently, then fire the opposite pair to settle a turn.
export function airTurn(rate: number, jet: number, targetRate: number, dt: number) {
  const demand = Math.max(-1, Math.min(1, -(targetRate - rate) * 1.8));
  const nextJet = jet + (demand - jet) * (1 - Math.exp(-dt * 7));
  const nextRate = rate + (-nextJet * 1.7 - rate * 0.65) * dt;
  return { rate: nextRate, jet: nextJet };
}

// Descend briskly from height, brake early, then settle without a long hovering tail.
export function verticalFlight(height: number, velocity: number, target: number, flying: boolean, dt: number) {
  if (!flying && height <= 0.035 && velocity <= 0)
    return { height: 0, velocity: 0, thrust: 0 };
  const desiredVelocity = flying
    ? Math.max(-12, Math.min(12, (target - height) * 1.8))
    : -Math.min(14, Math.sqrt(6 * Math.max(0, height)), Math.max(0.65, height * 1.5));
  const acceleration = Math.max(-5, Math.min(8.19, (desiredVelocity - velocity) * 4));
  let nextVelocity = velocity + acceleration * dt;
  // The last metres reserve enough lift for a soft touchdown, even after a fast descent.
  nextVelocity = Math.max(nextVelocity, -Math.sqrt(6 * Math.max(0, height) + 0.16));
  const nextHeight = Math.max(0, height + nextVelocity * dt);
  if (nextHeight <= 0.035 && nextVelocity <= 0 && (!flying || target <= 0))
    return { height: 0, velocity: 0, thrust: 0 };
  return { height: nextHeight, velocity: nextVelocity, thrust: 9.81 + acceleration };
}

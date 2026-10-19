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

// Holding climb builds escape speed; releasing it brakes to hover at any altitude.
export function escapeFlight(height: number, velocity: number, input: number, held: number, dt: number): {height:number;velocity:number;thrust:number;held:number} {
  if (dt <= 0) return { height, velocity, thrust: 9.81, held };
  // Small physics steps keep the faster climb consistent on slower screens.
  if (dt > 1 / 120) {
    const steps = Math.ceil(dt * 120);
    let state = {height, velocity, thrust:9.81, held};
    for (let i=0;i<steps;i++) state=escapeFlight(state.height,state.velocity,input,state.held,dt/steps);
    return state;
  }
  // Below 1 km climb stays gentle; above it use the earlier fast space climb, even after releasing E.
  const duration = input !== 0 ? held + dt : 0;
  const fastClimb = height >= 1000;
  const speed = input > 0
    ? fastClimb ? 32000 : Math.min(3000, 8 + duration * duration * 4)
    : Math.min(8000, 8 + duration * duration * 3);
  const desired = input * Math.min(speed, input < 0 ? Math.max(.5, height * .35) : speed);
  const acceleration = input === 0
    ? -velocity * (1 - Math.exp(-dt * 2.5)) / dt
    : Math.max(-350, Math.min(input > 0 ? (fastClimb ? 25000 : 180) : 350, (desired - velocity) * 1.2));
  let nextVelocity = velocity + acceleration * dt;
  // Descending slows near the ground, even after returning from deep space.
  nextVelocity = Math.max(nextVelocity, -Math.max(1, height * 2.2));
  return { height: Math.max(0, height + nextVelocity * dt), velocity: nextVelocity,
    thrust: Math.max(0, Math.min(18, 9.81 + acceleration)), held: duration };
}

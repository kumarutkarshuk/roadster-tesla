// Pedals brake before changing direction; holding S then reverses up to 35 km/h.
export function pedalSpeed(speed: number, dt: number, forward: boolean, reverse: boolean, boost: boolean, cruise: boolean) {
  if (reverse) return speed > 0 ? Math.max(0, speed - dt * 65) : Math.max(-35, speed - dt * 18);
  if (forward || boost) {
    if (speed < 0) return Math.min(0, speed + dt * 65);
    return Math.min(boost ? 265 : 180, speed + dt * (boost ? 70 : 32));
  }
  if (cruise) return speed + Math.sign(72 - speed) * Math.min(Math.abs(72 - speed), dt * 18);
  return slowDown(speed, dt * 5);
}

// Coasting and rough ground slow the car towards rest in either direction.
export function slowDown(speed: number, amount: number) {
  return Math.sign(speed) * Math.max(0, Math.abs(speed) - amount);
}

// Reverse turns the car's nose the other way while keeping steering strength bounded.
export function steeringRate(speed: number, steering: number) {
  return -steering * 1.2 * Math.max(-1, Math.min(1, speed / 15)) / (1 + Math.abs(speed) / 100);
}

// The chase view opens by only two metres as speed rises, including during boost.
export function chaseDistance(speed: number, portrait: boolean) {
  return (portrait ? 9.5 : 8) + Math.min(Math.abs(speed) / 180, 1) * 2;
}

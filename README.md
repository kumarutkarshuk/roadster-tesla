# Roadster — Beyond the Road

A relaxing 3D driving game built with Next.js, React, and Three.js. An original procedural world and car model; no assets or source code copied from Slow Roads or Tesla.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. `npm run build` creates the production build; `npm start` serves it. `npm run lint` checks the source.

## Play

The game starts in sunny countryside in auto cruise at a target of 72 km/h. Press W/S or the up/down arrows to take manual control. A/D or left/right arrows steer. Steer off the asphalt to explore the terrain. When offroad, click **return to road** or press **B** to rejoin the current stretch without resetting your distance or gas reserve. Space toggles lift-off and assisted landing. E climbs, Q descends, and X triggers a thruster-assisted barrel roll (including automatic lift-off from the ground). Shift consumes compressed gas for forward boost. C switches cameras, P pauses, R resets, and F enters fullscreen. Touch controls support steering, acceleration, braking, boost, flight, altitude, and flips on phones.

Choose Countryside, Pacific Coast, Alpine Pass, or Desert Run from the top-right scenery panel. Daylight, golden hour, and nightfall live in the same panel. Settings include three camera positions and synthesized motor and thruster sound. Audio starts after the first click or keypress and can be muted. The help panel explains the controls and inspiration.

## Design and physics references

Research date: October 17, 2026.

- [Tesla — The Ramp | Roadster](https://www.youtube.com/watch?v=7p5LxFdc-Qg): Tesla's official demonstration, inspected in the browser. The silver angular body, dark canopy, full-width rear light, visible gas plumes, brief airborne maneuver, and landing inform the original stylized model.
- [Tesla Roadster product page](https://www.tesla.com/roadster): official reference; direct page access was denied in this environment, so no exact dimensions, mass, tank pressure, or production specifications are claimed from it.
- [NASA — Rocket Control](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-control/): exhaust direction and torque inform the side-jet arrangement; this is an original game configuration, not a claim about Tesla’s actual nozzle layout.
- [Slow Roads](https://slowroads.io/): inspiration for relaxed, endless procedural driving.

Flight is a **game approximation**, not a validated Tesla simulator. The engine integrates vertical acceleration using gravity of 9.81 m/s². A bounded controller supplies lift and landing assistance. Free flight provides unlimited lift with no programmed altitude cap; E/Q control altitude. This deliberately goes beyond the brief real-world demonstration. Boost and flips share a rechargeable gas budget. The initial seven-meter lift-off target, acceleration limits, gas usage, and recharge rate are gameplay choices. A flip is a stabilized 360-degree roll with a 1.25-second animation, not a full six-axis rigid-body simulation. Side jets form opposing force pairs: one pair accelerates the roll, and the opposite pair brakes it. Their output follows the angular acceleration of the roll animation. Lift nozzles gimbal downward during a roll to match the simplified hover controller. Airborne steering also works at zero forward speed: front/rear lateral jets form a force couple for yaw, with a brief opposite burst when the steering input is released. A deadband suppresses tiny corrections, and side jets shut off after the yaw settles; only lift jets remain active during steady hover.

Manual driving supports independent heading and off-road movement, terrain-aligned suspension, and higher rolling resistance on grass. Ground contact samples the same triangles as the visible terrain, including the tire edges and underbody. Front wheels visibly steer with a tighter angle on the inside wheel, independent of tire spin; they straighten smoothly when released or airborne. Cruise guides the car along the road. The left guardrail blocks the full car body on both sides, slows impacts, and guides the car along the rail. Sufficiently high flight clears it; open shoulders still allow offroad driving. Driving into the sea or beyond the generated terrain returns the car to the road; R also resets it.

## Implementation

- `app/components/world.ts`: deterministic road and terrain generation, recycled world chunks, instanced vegetation, physics, rendering, and resource disposal.
- `app/components/roadster.tsx`: dashboard, keyboard and touch input, settings, scene selection, audio, and help.
- `app/components/car.ts`: original silver Roadster model inspired by the supplied rear reference, dark canopy, narrow red light bar, recessed diffuser, small gas outlets, and independent front steering pivots.
- `app/components/terrain.ts`: shared terrain geometry heights and exact triangle sampling for road, offroad, camera, and exhaust contact.
- `app/components/guardrail.ts`: full-body rail clearance, crossing prevention, and sliding contact response.
- `app/components/scenery.ts`: procedural sky and clouds, reflective ocean, surface textures, and alpha-cutout foliage.
- `app/components/exhaust.ts`: camera-facing condensation particles, world-space drift, smooth dissipation, roll/yaw-jet timing, and surface impact. Near the road or terrain, the mist redirects along the surface into a spreading, billowing cloud, then slows and fades. Visible mist is a gameplay representation of expanding gas, not a fluid simulation.
- `app/components/audio.ts`: gesture-unlocked motor, gas hiss, and thruster rumble with smooth gain transitions.
- `app/globals.css`: responsive interface, panels, and mobile controls.

The countryside uses bundled AI-generated leaf and meadow textures, layered foliage, branch geometry, grass blades, surface normal maps, soft shadows, and atmospheric distance haze. It remains a real-time procedural game rather than a photorealistic scan of a real location. See [texture provenance and generation prompts](public/textures/ASSETS.md). No external assets or font downloads are required at runtime. WebGL is required; initialization failures show a retry screen. This is an independent fan experience, unaffiliated with Tesla or Slow Roads.

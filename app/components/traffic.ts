import * as THREE from "three";
import { makeTrafficModel, type TeslaTrafficModel } from "./tesla-traffic-model";
import { center, drivingSurface } from "./terrain";
import { sweepScenery, type CityBox } from "./city-layout";

// Three Tesla body styles travel in opposite lanes with long, open gaps.
export function createTraffic(scene: THREE.Scene) {
  const fleet = ["#eceeef", "#962d32", "#243c67", "#303337", "#bbc0c4", "#f0efea"].map((paint, i) => {
    const kind = (["Model 3", "Model Y", "Cybertruck"] as TeslaTrafficModel[])[i%3];
    const model = makeTrafficModel(kind,paint); scene.add(model.car);
    const direction = i%2 ? -1 : 1;
    return { ...model, t: 240 + i * 190, direction, lane: direction * 5.75 };
  });
  const boxes: CityBox[] = [];
  return { boxes, update(playerT: number, playerX: number, dt: number, environment: "coast" | "cyber", visible: boolean, playerY: number, playerHeading: number) {
    boxes.length = 0;
    for (const vehicle of fleet) {
      vehicle.car.visible = visible;
      if (!visible) continue;
      if (vehicle.t < playerT - 200 || vehicle.t > playerT + 1500) vehicle.t = playerT + 700 + fleet.indexOf(vehicle) * 130;
      // Traffic brakes behind a stopped player instead of passing through the car.
      const gap = (playerT - vehicle.t)*vehicle.direction;
      const blocked = gap > 0 && gap < 24 && Math.abs(playerX-center(vehicle.t)-vehicle.lane) < 2.8;
      // Sweep the moving traffic hull against the player before placing it this frame.
      const oldT = vehicle.t;
      const oldX = center(oldT) + vehicle.lane;
      const nextT = oldT + (blocked ? 0 : 16) * dt * vehicle.direction;
      const nextX = center(nextT) + vehicle.lane;
      const trafficHeading = Math.atan2(center(oldT+2)-center(oldT-2),4);
      const sin = Math.abs(Math.sin(playerHeading)), cos = Math.abs(Math.cos(playerHeading));
      const contact = sweepScenery(
        {x:oldX,y:drivingSurface(oldT,oldX,environment),z:-oldT},
        {x:nextX,y:drivingSurface(nextT,nextX,environment),z:-nextT},
        [{x:playerX,y:playerY+.9,z:-playerT,w:2.6*cos+5*sin,h:1.8,d:5*cos+2.6*sin}],
        0,vehicle.height,{heading:trafficHeading,halfWidth:vehicle.width/2,halfLength:vehicle.length/2});
      vehicle.t = contact.hit ? oldT : nextT;
      const x = center(vehicle.t) + vehicle.lane;
      const y = drivingSurface(vehicle.t, x, environment);
      const yaw = Math.atan2(center(vehicle.t+2)-center(vehicle.t-2),4);
      vehicle.car.position.set(x,y,-vehicle.t); vehicle.car.rotation.y=-yaw+(vehicle.direction < 0 ? Math.PI : 0);
      vehicle.car.rotation.x=Math.atan2(drivingSurface(vehicle.t+2,center(vehicle.t+2)+vehicle.lane,environment)-drivingSurface(vehicle.t-2,center(vehicle.t-2)+vehicle.lane,environment),4)*vehicle.direction;
      vehicle.wheels.forEach(wheel => { wheel.rotation.x -= (blocked ? 0 : 16) * dt * vehicle.direction / vehicle.radius; });
      // Collision bounds follow the rotated body on road bends.
      const turnSin=Math.abs(Math.sin(yaw)), turnCos=Math.abs(Math.cos(yaw));
      boxes.push({x,y:y+vehicle.height/2,z:-vehicle.t,w:vehicle.width*turnCos+vehicle.length*turnSin,h:vehicle.height,d:vehicle.length*turnCos+vehicle.width*turnSin});
    }
  }};
}

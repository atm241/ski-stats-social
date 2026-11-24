import * as THREE from "three";
import type { TrickFrame } from "./park";
import type { Activity } from "./replay";

/** Diorama scale for the rider, in line with the oversized trees and chairs. */
const SKIER_SCALE = 9;

/**
 * Little low-poly skier. Built in real-world meters (about 1.7 m tall) and scaled up.
 * Poses: carving on runs, sitting on lifts, plodding uphill, standing otherwise; in the park, sliding
 * rails with skis across them, spinning and grabbing in the air.
 */
export function createSkier(jacket = "#2f7fe0") {
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 });
  const mats = { jacket: mat(jacket), pants: mat("#26324f"), helmet: mat("#ffd36b"), dark: mat("#1b2133"), pole: mat("#9aa3b5") };
  const box = (w: number, h: number, d: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.castShadow = true;
    return mesh;
  };

  const root = new THREE.Group(); // positioned & yawed by the replay
  const body = new THREE.Group(); // leans / sways
  body.rotation.order = "YXZ"; // spin/slide angle first, then lean and roll relative to it
  root.add(body);
  root.scale.setScalar(SKIER_SCALE);

  // Legs pivot at the hip so they can fold forward when sitting on a chair.
  // Each leg (with its ski) also pivots on its own at the hip, so they can splay apart in the air.
  const legs = new THREE.Group();
  legs.position.y = 0.8;
  const hips: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.x = side * 0.12;
    const leg = box(0.15, 0.78, 0.17, mats.pants);
    leg.position.set(0, -0.39, 0);
    const ski = box(0.1, 0.035, 1.65, mats.dark);
    ski.position.set(0, -0.79, 0.12);
    hip.add(leg, ski);
    hips.push(hip);
    legs.add(hip);
  }
  body.add(legs);

  const torso = box(0.44, 0.56, 0.27, mats.jacket);
  torso.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mats.helmet);
  head.position.y = 1.52;
  head.castShadow = true;
  const goggles = box(0.24, 0.07, 0.06, mats.dark);
  goggles.position.set(0, 1.5, 0.14);
  body.add(torso, head, goggles);

  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 1.3, 0);
    const sleeve = box(0.11, 0.5, 0.12, mats.jacket);
    sleeve.position.y = -0.25;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.15, 4), mats.pole);
    pole.position.set(0, -0.62, -0.12);
    pole.rotation.x = 0.35;
    arm.add(sleeve, pole);
    arm.rotation.x = -0.35;
    arms.push(arm);
    body.add(arm);
  }

  let clock = 0;
  const pose = (activity: Activity, dt: number, trick?: TrickFrame | null) => {
    clock += dt;
    arms.forEach((a) => (a.rotation.z = 0));
    hips.forEach((h) => (h.rotation.z = 0));
    body.rotation.y = 0;
    if (trick && trick.pose !== "ride") {
      body.rotation.y = trick.bodyYaw;
      body.position.y = 0;
      if (trick.pose === "slide") {
        // skis across the rail, balanced, arms out
        body.rotation.x = 0.1;
        body.rotation.z = 0;
        legs.rotation.x = 0;
        arms.forEach((a, i) => {
          a.rotation.x = -0.3;
          a.rotation.z = (i ? 1 : -1) * 1.05;
        });
      } else {
        // air: compact, knees up a little; a grab reaches one hand down to the skis
        body.rotation.x = 0.3 + trick.grab * 0.35;
        body.rotation.z = 0;
        legs.rotation.x = -0.25 - trick.grab * 0.45;
        arms.forEach((a, i) => (a.rotation.x = i === 1 ? -0.6 - trick.grab * 0.9 : -0.6));
        if (trick.spread > 0) {
          // spread eagle: tall body, legs and skis kicked out to the sides, arms flung up and out
          const k = trick.spread;
          body.rotation.x = 0.3 * (1 - k) + 0.05 * k;
          legs.rotation.x = -0.25 * (1 - k);
          hips.forEach((h, i) => (h.rotation.z = (i ? 1 : -1) * 0.75 * k));
          arms.forEach((a, i) => {
            a.rotation.x = -0.6 * (1 - k) - 0.2 * k;
            a.rotation.z = (i ? 1 : -1) * 2.3 * k;
          });
        }
      }
      return;
    }
    if (activity === "run") {
      body.rotation.x = 0.28; // forward stance
      body.rotation.y = trick?.bodyYaw ?? 0;
      body.rotation.z = trick ? trick.roll : Math.sin(clock * 4) * 0.28; // carving side to side (or leaning into a pipe wall)
      body.position.y = Math.abs(Math.sin(clock * 4)) * -0.06;
      legs.rotation.x = 0;
      arms.forEach((a, i) => (a.rotation.x = -0.5 + Math.sin(clock * 4 + i) * 0.1));
    } else if (activity === "lift") {
      body.rotation.set(0, 0, 0);
      body.position.y = 0;
      legs.rotation.x = -1.35; // sitting, skis dangling forward
      arms.forEach((a) => (a.rotation.x = -0.9));
    } else if (activity === "skin") {
      body.rotation.set(0.15, 0, 0);
      legs.rotation.x = Math.sin(clock * 3) * 0.3;
      arms.forEach((a, i) => (a.rotation.x = -0.35 + Math.sin(clock * 3 + i * Math.PI) * 0.4));
    } else {
      body.rotation.set(0, 0, 0);
      body.position.y = 0;
      legs.rotation.x = 0;
      arms.forEach((a) => (a.rotation.x = -0.2));
    }
  };

  return {
    object: root,
    /** world-space height of the figure, for placing a marker above it */
    height: 1.7 * SKIER_SCALE,
    pose,
    dispose: () => {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
  };
}

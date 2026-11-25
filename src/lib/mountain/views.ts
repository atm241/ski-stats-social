import * as THREE from "three";
import { difficultyOf } from "./difficulty";
import type { Terrain } from "./terrain";
import type { MountainData } from "./types";

/** Camera views of a mountain (lift base, landmarks, named lines) and which way it faces. */

type View = { position: THREE.Vector3; target: THREE.Vector3 };

export interface SkiLine {
  name: string;
  difficulty: string;
  /** the longest mapped piece, for highlighting */
  runIndex: number;
  /** just above where you drop in */
  labelAt: THREE.Vector3;
  /** a camera looking at it from below and to the side */
  view: { position: THREE.Vector3; target: THREE.Vector3 };
  /** 3 = extreme/off-piste, 2 = double black, 1 = black with a line-ish name; more length breaks ties */
  rank: number;
}

/** Names that are terrain, not a groomer: "Main Chute", "Corbet's Couloir", "The Fingers", "Headwall Face". */
export const LINE_NAME = /chute|couloir|gully|gulch|cliff|face|cirque|notch|slot|finger|knob|wall|cornice|ridge|bowl|headwall|tongue|hollow|keyhole|spine|nose|buttress|crack|rock|alley|glade|trees|steeps|drop/i;

/** The cosy "lift base" view: behind and above the bottom station, looking up the line. */
export function liftBaseView(terrain: Terrain, hero: { bottom: THREE.Vector3; top: THREE.Vector3 }): View {
  const dir = new THREE.Vector3().subVectors(hero.top, hero.bottom).setY(0).normalize();
  const target = hero.bottom.clone().addScaledVector(dir, 700);
  target.y = terrain.yAt(target.x, target.z) + 120;
  const side = new THREE.Vector3(-dir.z, 0, dir.x); // perpendicular, so the lift crosses the frame diagonally
  const position = hero.bottom.clone().addScaledVector(dir, -600).addScaledVector(side, 320);
  position.y = Math.max(terrain.yAt(position.x, position.z), hero.bottom.y) + 260;
  return { position, target };
}

/** Looks at a spot from below and a little to the side of its fall line, so a cliff band faces the camera. */
export function viewAt(terrain: Terrain, x: number, z: number, D: number): View {
  const gx = terrain.yAt(x + 150, z) - terrain.yAt(x - 150, z);
  const gz = terrain.yAt(x, z + 150) - terrain.yAt(x, z - 150);
  const len = Math.hypot(gx, gz) || 1;
  const turn = 0.35; // radians off the fall line, for a three-quarter view
  const dx = (-gx / len) * Math.cos(turn) - (-gz / len) * Math.sin(turn);
  const dz = (-gx / len) * Math.sin(turn) + (-gz / len) * Math.cos(turn);
  const target = new THREE.Vector3(x, terrain.yAt(x, z) + 10, z);
  const position = new THREE.Vector3(x + dx * D, 0, z + dz * D);
  // look down on it (~24°) rather than up from the valley, so steep lines sit mid-frame
  position.y = Math.max(terrain.yAt(position.x, position.z) + D * 0.3, target.y + D * 0.45);
  return { position, target };
}

/** Named lines: steep runs and anything named like terrain. One entry per name (OSM often splits a line). */
export function skiLines(data: MountainData, terrain: Terrain, runPaths: [number, number][][]): SkiLine[] {
  const lineByName = new Map<string, SkiLine & { len: number }>();
  data.runs.forEach((r, i) => {
    const name = r.name?.trim();
    if (!name) return;
    const d = difficultyOf(r.difficulty);
    const steep = d === "expert" || d === "freeride" || d === "extreme";
    if (!steep && !(d === "advanced" && LINE_NAME.test(name))) return;
    const path = runPaths[i];
    if (path.length < 2) return;
    let len = 0;
    for (let k = 1; k < path.length; k++) len += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
    const prev = lineByName.get(name);
    if (prev && prev.len >= len) return;
    const [top, bottom] = terrain.yAt(...path[0]) >= terrain.yAt(...path[path.length - 1]) ? [path[0], path[path.length - 1]] : [path[path.length - 1], path[0]];
    const look: [number, number] = [top[0] + (bottom[0] - top[0]) * 0.35, top[1] + (bottom[1] - top[1]) * 0.35];
    lineByName.set(name, {
      name,
      difficulty: d,
      runIndex: i,
      labelAt: new THREE.Vector3(top[0], terrain.yAt(...top) + 22, top[1]),
      view: viewAt(terrain, look[0], look[1], Math.min(900, Math.max(450, len * 1.1))),
      rank: (d === "freeride" || d === "extreme" ? 3 : d === "expert" ? 2 : 1) + Math.min(0.99, len / 3000),
      len,
    });
  });
  return [...lineByName.values()].map(({ len, ...l }) => (void len, l)).sort((a, b) => b.rank - a.rank);
}

/** Which way the runs come down (Snowbird & Alta face north), so the default view looks up the mountain. */
export function facing(terrain: Terrain, runPaths: [number, number][][]): THREE.Vector2 {
  const flow = new THREE.Vector2();
  for (const path of runPaths) {
    if (path.length < 2) continue;
    const [x0, z0] = path[0];
    const [x1, z1] = path[path.length - 1];
    const down = terrain.yAt(x0, z0) >= terrain.yAt(x1, z1) ? 1 : -1;
    flow.x += (x1 - x0) * down;
    flow.y += (z1 - z0) * down;
  }
  return flow.lengthSq() > 1 ? flow.normalize() : new THREE.Vector2(0.39, 0.92);
}

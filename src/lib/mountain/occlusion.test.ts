import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createOccluderHider } from "./occlusion";

describe("occluder hider", () => {
  const station = () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial(), 2);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(50, 0, 0)); // between camera and skier
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(50, 0, 200)); // off to the side
    return mesh;
  };
  const scaleOf = (mesh: THREE.InstancedMesh, i: number) => {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixScale(m).x;
  };

  it("hides only the station in the line of sight, and brings it back when the view clears", () => {
    const mesh = station();
    const hider = createOccluderHider(mesh);
    expect(hider.update(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 0, 0))).toBe(1);
    expect(scaleOf(mesh, 0)).toBe(0);
    expect(scaleOf(mesh, 1)).toBe(1);
    expect(hider.update(new THREE.Vector3(0, 80, 0), new THREE.Vector3(100, 80, 0))).toBe(0);
    expect(scaleOf(mesh, 0)).toBe(1);
  });

  it("leaves the station the skier is standing in", () => {
    const mesh = station();
    const hider = createOccluderHider(mesh);
    expect(hider.update(new THREE.Vector3(0, 0, 0), new THREE.Vector3(50, 2, 0))).toBe(0);
  });
});

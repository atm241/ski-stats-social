import * as THREE from "three";

/**
 * Keeps big instanced props (lift stations) from blocking the follow camera: any instance whose bounds
 * sit between the camera and the skier is hidden until the view clears. The skier's own station isn't
 * hidden (you're standing in it at the top of a lift), only ones in the way.
 */
export function createOccluderHider(mesh: THREE.InstancedMesh) {
  const geo = mesh.geometry;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const local = geo.boundingSphere!;
  const original: THREE.Matrix4[] = [];
  const spheres: THREE.Sphere[] = [];
  for (let i = 0; i < mesh.count; i++) {
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(i, m);
    original.push(m);
    spheres.push(local.clone().applyMatrix4(m));
  }
  const hidden = new Uint8Array(mesh.count);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const seg = new THREE.Line3();
  const closest = new THREE.Vector3();

  return {
    /** Call after the camera moves. Returns how many instances are hidden. */
    update(camera: THREE.Vector3, subject: THREE.Vector3) {
      seg.set(camera, subject);
      let changed = false;
      let count = 0;
      for (let i = 0; i < spheres.length; i++) {
        const s = spheres[i];
        const block = s.center.distanceTo(subject) > s.radius && seg.closestPointToPoint(s.center, true, closest).distanceTo(s.center) < s.radius;
        if (block) count++;
        if (block !== !!hidden[i]) {
          hidden[i] = block ? 1 : 0;
          mesh.setMatrixAt(i, block ? zero : original[i]);
          changed = true;
        }
      }
      if (changed) mesh.instanceMatrix.needsUpdate = true;
      return count;
    },
  };
}

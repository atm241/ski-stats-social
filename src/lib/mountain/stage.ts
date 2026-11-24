import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import type { MountainScene } from "./buildScene";

const SKY = "#e7eaed";
const FT = 3.28084;

/**
 * Renderer, lights, camera, orbit controls, peak labels and the render loop around a built
 * mountain. Shared by the mountain explorer and the day replay.
 */
export function createStage(el: HTMLElement, built: MountainScene) {
  const { terrain } = built;
  const span = Math.max(terrain.widthM, terrain.depthM);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  el.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  el.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, span * 0.7, span * 2.6);
  scene.add(built.root);

  scene.add(new THREE.HemisphereLight("#f4f6f8", "#a9adb5", 1.7));
  const sun = new THREE.DirectionalLight("#fff6ea", 2.2);
  sun.position.copy(new THREE.Vector3(-0.55, 0.75, 0.45).normalize().multiplyScalar(span)); // low-ish sun from the south-west
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -span * 0.6;
  sc.right = sc.top = span * 0.6;
  sc.near = 10;
  sc.far = span * 3;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(38, 1, 5, span * 6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = 1.38;
  controls.minDistance = 40;
  controls.maxDistance = span * 2.2;

  const homeView = () => {
    camera.position.set(span * 0.55, span * 0.75, span * 1.3);
    controls.target.set(0, (terrain.maxEle - terrain.minEle) * terrain.exaggeration * 0.35, 0);
    controls.update();
  };
  homeView();

  const peakLabels = new THREE.Group();
  for (const p of built.peaks) {
    const div = document.createElement("div");
    div.className = "rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-bold text-ink shadow ring-1 ring-black/5 whitespace-nowrap";
    div.textContent = p.ele ? `▲ ${p.name} · ${Math.round(p.ele * FT).toLocaleString()} ft` : `▲ ${p.name}`;
    const obj = new CSS2DObject(div);
    obj.position.copy(p.position).add(new THREE.Vector3(0, 60, 0));
    peakLabels.add(obj);
  }
  scene.add(peakLabels);

  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const m of built.lineMaterials) m.resolution.set(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  const frameCallbacks: ((dt: number) => void)[] = [];
  const afterRenderCallbacks: (() => void)[] = [];
  let frame = 0;
  let last = performance.now();
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const cb of frameCallbacks) cb(dt);
    controls.update();
    renderer.render(scene, camera);
    // Runs in the same task as render, so the WebGL canvas can still be copied (e.g. for recording).
    for (const cb of afterRenderCallbacks) cb();
    labelRenderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  return {
    span,
    renderer,
    scene,
    camera,
    controls,
    peakLabels,
    homeView,
    onFrame: (cb: (dt: number) => void) => frameCallbacks.push(cb),
    afterRender: (cb: () => void) => afterRenderCallbacks.push(cb),
    dispose: () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      built.dispose();
      renderer.dispose();
      el.replaceChildren();
    },
  };
}

export type Stage = ReturnType<typeof createStage>;

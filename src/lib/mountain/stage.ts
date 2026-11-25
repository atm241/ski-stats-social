import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { DIFFICULTY, type MountainScene } from "./buildScene";

const SKY = "#e7eaed";
const FT = 3.28084;
/** Line names show once the camera is this close (m): zoomed in on an area, not the whole-resort view. */
const LINE_LABEL_DIST = 2600;

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
  labelRenderer.domElement.style.isolation = "isolate"; // keep its per-label z-indexes under the overlay panels
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
    // from the side the runs face, a little off-axis so the relief reads
    const d = built.homeDirection.clone().rotateAround(new THREE.Vector2(), 0.4);
    camera.position.set(d.x * span * 1.41, span * 0.75, d.y * span * 1.41);
    controls.target.set(0, (terrain.maxEle - terrain.minEle) * terrain.exaggeration * 0.35, 0);
    controls.update();
  };
  homeView();

  const peakLabels = new THREE.Group();
  // When labels collide (see declutter below), landmark summits (KT-22, Lone Peak) win, then higher ones.
  // Landmark and OSM peak names can differ, so match them by position.
  const isLandmark = (p: THREE.Vector3) =>
    built.landmarkViews.some((l) => l.kind === "peak" && Math.hypot(l.target.x - p.x, l.target.z - p.z) < 80);
  const rank = (p: (typeof built.peaks)[number]) => (isLandmark(p.position) ? 1e6 : 0) + (p.ele ?? 0);
  const labelDivs: HTMLDivElement[] = [];
  for (const p of [...built.peaks].sort((a, b) => rank(b) - rank(a))) {
    const div = document.createElement("div");
    div.className = "rounded-md border border-white/10 bg-[#090b10]/85 px-2 py-0.5 text-[11px] font-medium text-[#e8edf5] whitespace-nowrap transition-opacity duration-200";
    labelDivs.push(div);
    div.textContent = p.ele ? `${p.name} · ${Math.round(p.ele * FT).toLocaleString()} ft` : p.name;
    const obj = new CSS2DObject(div);
    obj.position.copy(p.position).add(new THREE.Vector3(0, 60, 0));
    peakLabels.add(obj);
  }
  scene.add(peakLabels);

  // Named lines (Main Chute, Corbet's): small labels at the drop-in that appear as you get close,
  // so the whole-resort view stays clean and zooming in reveals the local names.
  const lineLabels = new THREE.Group();
  const lineDivs: { div: HTMLDivElement; at: THREE.Vector3; obj: CSS2DObject }[] = [];
  for (const l of built.lines) {
    const div = document.createElement("div");
    div.className = "rounded border border-white/5 bg-[#090b10]/75 px-1.5 py-px text-[10px] font-medium text-[#e8edf5] whitespace-nowrap transition-opacity duration-200";
    const sym = document.createElement("span");
    sym.className = "mr-1 text-[#8b95a8]";
    sym.textContent = DIFFICULTY[l.difficulty]?.symbol ?? "";
    div.append(sym, l.name);
    div.style.opacity = "0";
    const obj = new CSS2DObject(div);
    obj.position.copy(l.labelAt);
    lineLabels.add(obj);
    obj.visible = false; // until the first declutter pass decides
    lineDivs.push({ div, at: l.labelAt, obj });
  }
  scene.add(lineLabels);

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

  // Some resorts have twenty-odd named summits; fade out any label that would overlap a higher one.
  // CSS2DRenderer owns `display` (frustum culling), so this uses opacity. Checked a few times a second.
  /** Is there terrain between the camera and this point? Samples the heightfield along the sight line. */
  const hidden = (at: THREE.Vector3) => {
    const c = camera.position;
    for (let k = 1; k < 16; k++) {
      const f = k / 16;
      const x = c.x + (at.x - c.x) * f;
      const z = c.z + (at.z - c.z) * f;
      if (built.terrain.yAt(x, z) > c.y + (at.y - c.y) * f + 8) return true;
    }
    return false;
  };

  // Line labels join the same pass after the peaks, steepest lines first, and only near the camera.
  let declutterTick = 0;
  const declutter = () => {
    if (++declutterTick % 8) return;
    // Measure every candidate first, then write opacities: interleaving reads and writes forces a
    // layout per label, which cost Park City (26 peaks) ~15 fps.
    const candidates: HTMLDivElement[] = [];
    if (peakLabels.visible) for (const div of labelDivs) if (div.style.display !== "none") candidates.push(div);
    // Out-of-range or behind-terrain line labels are made invisible (not just transparent) so the
    // label renderer skips them; big maps like Whistler have ~150 named lines.
    if (lineLabels.visible)
      for (const l of lineDivs) {
        const show = camera.position.distanceTo(l.at) < LINE_LABEL_DIST && !hidden(l.at);
        if (l.obj.visible !== show) l.obj.visible = show;
        if (show && l.div.style.display !== "none") candidates.push(l.div);
      }
    const rects = candidates.map((d) => d.getBoundingClientRect());
    const kept: DOMRect[] = [];
    const shown = rects.map((r) => {
      const hit = kept.some((k) => r.left < k.right + 4 && r.right > k.left - 4 && r.top < k.bottom + 2 && r.bottom > k.top - 2);
      if (!hit) kept.push(r);
      return !hit;
    });
    candidates.forEach((d, k) => {
      const o = shown[k] ? "1" : "0";
      if (d.style.opacity !== o) d.style.opacity = o;
    });
  };

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
    declutter();
  };
  frame = requestAnimationFrame(loop);

  return {
    span,
    renderer,
    scene,
    camera,
    controls,
    peakLabels,
    lineLabels,
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


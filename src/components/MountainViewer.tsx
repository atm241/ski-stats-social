"use client";

import { Check, Mountain, MapPin, Pause, RotateCw, Route, Sparkles, Triangle, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Difficulty } from "./ui";
import * as THREE from "three";
import { mountainUrl } from "@/lib/mountain/source";
import { buildMountainScene, DIFFICULTY } from "@/lib/mountain/buildScene";
import { createStage } from "@/lib/mountain/stage";
import type { MountainData } from "@/lib/mountain/types";

type Hover = { x: number; y: number; title: string; sub: string } | null;
const LANDMARK_ICON: Record<string, LucideIcon> = { cliff: Mountain, park: Sparkles, pipe: Sparkles, peak: Triangle };
const GLASS_BTN = "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-bg/75 px-3 py-1.5 text-sm text-ink backdrop-blur transition-colors hover:bg-bg/90";

/** `skiedRuns`: the signed-in skier's runs here, for the "My runs" overlay and hover ticks. */
export function MountainViewer({ slug, skiedRuns }: { slug: string; skiedRuns?: string[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [hover, setHover] = useState<Hover>(null);
  const [spin, setSpin] = useState(true);
  const [labels, setLabels] = useState(true);
  const [trails, setTrails] = useState(true);
  const [mine, setMine] = useState(false);
  const skied = useRef(new Set<string>());
  useEffect(() => {
    skied.current = new Set(skiedRuns ?? []);
  }, [skiedRuns]);
  const [landmarks, setLandmarks] = useState<{ name: string; kind: string }[]>([]);
  const [lines, setLines] = useState<{ name: string; difficulty: string }[]>([]);
  const [lineNames, setLineNames] = useState(true);
  const [linesOpen, setLinesOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(-1);
  const api = useRef<{
    setSpin: (v: boolean) => void;
    setLabels: (v: boolean) => void;
    setTrails: (v: boolean) => void;
    setMine: (v: boolean) => void;
    setLineNames: (v: boolean) => void;
    pickLine: (i: number) => void;
    resetView: () => void;
    baseView: () => void;
    flyTo: (i: number) => void;
  } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    fetch(mountainUrl(slug))
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<MountainData>;
      })
      .then((data) => {
        if (disposed) return;
        cleanup = mount(el, data);
        setStatus("ready");
      })
      .catch(() => !disposed && setStatus("error"));

    function mount(el: HTMLDivElement, data: MountainData) {
      const built = buildMountainScene(data);
      const stage = createStage(el, built);
      const { renderer, camera, controls, peakLabels: labelGroup } = stage;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
      controls.addEventListener("start", () => setSpin(false));
      // Smooth camera flights to landmarks
      let flight: { from: THREE.Vector3; fromT: THREE.Vector3; to: THREE.Vector3; toT: THREE.Vector3; t: number } | null = null;
      const flyTo = (i: number) => {
        const v = built.landmarkViews[i];
        if (!v) return;
        controls.autoRotate = false;
        setSpin(false);
        flight = { from: camera.position.clone(), fromT: controls.target.clone(), to: v.position, toT: v.target, t: 0 };
      };
      controls.addEventListener("start", () => (flight = null));
      setLandmarks(built.landmarkViews.map(({ name, kind }) => ({ name, kind })));
      setLines(built.lines.map(({ name, difficulty }) => ({ name, difficulty })));

      // Picking a line: fly to it and keep it lit until another is picked
      const pickedMat = new THREE.MeshBasicMaterial({ color: "#5cc8ff", transparent: true, opacity: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5 });
      let pickedMesh: THREE.Mesh | null = null;
      const pickLine = (i: number) => {
        if (pickedMesh) {
          built.root.remove(pickedMesh);
          pickedMesh.geometry.dispose();
          pickedMesh = null;
        }
        const l = built.lines[i];
        if (!l) return;
        pickedMesh = new THREE.Mesh(built.runRibbon(l.runIndex), pickedMat);
        pickedMesh.renderOrder = 3;
        built.root.add(pickedMesh);
        controls.autoRotate = false;
        setSpin(false);
        flight = { from: camera.position.clone(), fromT: controls.target.clone(), to: l.view.position, toT: l.view.target, t: 0 };
      };

      const baseView = () => {
        if (!built.baseView) return;
        camera.position.copy(built.baseView.position);
        controls.target.copy(built.baseView.target);
        controls.autoRotate = false;
        setSpin(false);
        controls.update();
      };

      // Hover: runs (ribbons) and lift stations
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const highlightMat = new THREE.MeshBasicMaterial({ color: "#ffd36b", transparent: true, opacity: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
      let highlight: THREE.Mesh | null = null;
      let highlighted = -1;
      const setHighlight = (runIndex: number) => {
        if (runIndex === highlighted) return;
        if (highlight) {
          built.root.remove(highlight);
          highlight.geometry.dispose();
          highlight = null;
        }
        highlighted = runIndex;
        if (runIndex >= 0) {
          highlight = new THREE.Mesh(built.runRibbon(runIndex), highlightMat);
          highlight.renderOrder = 2;
          built.root.add(highlight);
        }
      };
      let pending: PointerEvent | null = null;
      const onPointerMove = (e: PointerEvent) => (pending = e);
      const onPointerLeave = () => {
        pending = null;
        setHover(null);
        setHighlight(-1);
      };
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerleave", onPointerLeave);

      const pick = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects([...built.runMeshes.filter((m) => m.visible), built.stations], false)[0];
        const at = { x: e.clientX - r.left, y: e.clientY - r.top };
        if (hit?.object === built.stations && hit.instanceId != null) {
          const lift = built.liftForStation[hit.instanceId];
          setHighlight(-1);
          setHover({ ...at, title: lift.name ?? "Lift", sub: lift.type === "gondola" ? "Gondola" : "Chairlift" });
        } else if (hit && hit.faceIndex != null) {
          const run = built.runForFace.get(hit.object as THREE.Mesh)?.[hit.faceIndex];
          if (run) {
            setHighlight(run.index);
            const d = DIFFICULTY[run.difficulty];
            setHover({ ...at, title: run.name ?? "Unnamed run", sub: `${d.symbol} ${d.label}${run.name && skied.current.has(run.name) ? " · you've skied it" : ""}` });
          }
        } else {
          setHighlight(-1);
          setHover(null);
        }
      };

      stage.onFrame((dt) => {
        if (flight) {
          flight.t = Math.min(1, flight.t + dt / 1.6);
          const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
          camera.position.lerpVectors(flight.from, flight.to, e);
          controls.target.lerpVectors(flight.fromT, flight.toT, e);
          if (flight.t >= 1) flight = null;
        }
        if (pending) {
          pick(pending);
          pending = null;
        }
      });

      api.current = {
        setSpin: (v) => (controls.autoRotate = v),
        setLabels: (v) => (labelGroup.visible = v),
        setTrails: (v) => built.runGroup.forEach((m) => (m.visible = v)),
        setLineNames: (v) => (stage.lineLabels.visible = v),
        pickLine,
        setMine: (v) => {
          const box = built.highlightRuns(v ? skied.current : null);
          if (!v || !box) return;
          // fly round to frame the runs you've skied, keeping the current viewing direction
          const target = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const dir = camera.position.clone().sub(controls.target).normalize();
          controls.autoRotate = false;
          setSpin(false);
          flight = { from: camera.position.clone(), fromT: controls.target.clone(), to: target.clone().add(dir.multiplyScalar(Math.max(size.x, size.z) * 1.2 + 500)), toT: target, t: 0 };
        },
        resetView: () => {
          stage.homeView();
          setLabels(true);
        },
        baseView: () => {
          baseView();
          setLabels(false);
        },
        flyTo: (i) => {
          flyTo(i);
          setLabels(false);
        },
      };

      return () => {
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
        setHighlight(-1);
        highlightMat.dispose();
        pickLine(-1);
        pickedMat.dispose();
        stage.dispose();
        api.current = null;
      };
    }

    return () => {
      disposed = true;
      cleanup();
    };
  }, [slug]);

  useEffect(() => {
    api.current?.setSpin(spin);
  }, [spin]);
  useEffect(() => {
    api.current?.setLabels(labels);
  }, [labels]);
  useEffect(() => {
    api.current?.setTrails(trails);
  }, [trails]);
  useEffect(() => {
    api.current?.setMine(mine);
  }, [mine, status]);
  useEffect(() => {
    api.current?.setLineNames(lineNames);
  }, [lineNames, status]);

  const q = query.trim().toLowerCase();
  const shownLines = lines.map((l, i) => ({ ...l, i })).filter((l) => !q || l.name.toLowerCase().includes(q));

  return (
    <div className="relative h-[72vh] min-h-[420px] overflow-hidden rounded-2xl border border-line bg-[#e7eaed] shadow-card">
      <div ref={host} className="absolute inset-0" />

      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center text-ink-soft">
          {status === "loading" ? (
            <span className="animate-pulse text-sm text-[#5d6678]">Building the mountain…</span>
          ) : (
            <span>Couldn&apos;t load this mountain.</span>
          )}
        </div>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-bg/90 px-3 py-1.5 shadow-xl backdrop-blur"
          style={{ left: hover.x, top: hover.y, transform: "translate(12px, -110%)" }}
        >
          <div className="text-sm font-medium">{hover.title}</div>
          <div className="text-xs text-ink-soft">{hover.sub}</div>
        </div>
      )}

      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-3 rounded-lg border border-white/10 bg-bg/75 px-3 py-1.5 text-xs text-ink-soft backdrop-blur">
        {(["easy", "intermediate", "advanced", "expert"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <Difficulty level={k} size={9} />
            {DIFFICULTY[k].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#d8433b]" aria-hidden /> Lifts
        </span>
      </div>

      {status === "ready" && landmarks.length > 0 && (
        <div className="absolute top-3 right-3 flex max-w-[55%] flex-wrap justify-end gap-1.5">
          {landmarks.map((l, i) => (
            <button key={l.name} type="button" onClick={() => api.current?.flyTo(i)} className={GLASS_BTN}>
              {(() => {
                const Icon = LANDMARK_ICON[l.kind] ?? MapPin;
                return <Icon size={13} className="text-accent" aria-hidden />;
              })()}
              {l.name}
            </button>
          ))}
        </div>
      )}

      {status === "ready" && linesOpen && (
        <div className="absolute top-14 left-3 z-20 flex max-h-[calc(100%-8rem)] w-72 flex-col overflow-hidden rounded-xl border border-white/10 bg-bg/90 shadow-2xl backdrop-blur">
          <div className="border-b border-white/10 p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium">Named lines</span>
              <span className="num text-xs text-ink-faint">{lines.length}</span>
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Chimney, Corbet's…" className="input py-1.5 text-sm" aria-label="Search lines" />
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={lineNames} onChange={(e) => setLineNames(e.target.checked)} /> Show names on the map as you zoom in
            </label>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1 text-sm">
            {shownLines.map((l) => (
              <li key={l.name}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(l.i);
                    api.current?.pickLine(l.i);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${picked === l.i ? "text-accent" : ""}`}
                >
                  <span className="w-5 shrink-0 text-center text-[11px] text-ink-faint">{DIFFICULTY[l.difficulty]?.symbol}</span>
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-faint">{DIFFICULTY[l.difficulty]?.label}</span>
                </button>
              </li>
            ))}
            {!shownLines.length && <li className="px-3 py-2 text-ink-faint">No line by that name on this map.</li>}
          </ul>
          <p className="border-t border-white/10 px-3 py-2 text-[11px] text-ink-faint">Names and lines from OpenStreetMap mappers, usually locals.</p>
        </div>
      )}

      {status === "ready" && (
        <div className="absolute right-3 bottom-3 flex flex-wrap justify-end gap-1.5">
          {lines.length > 0 && (
            <button type="button" onClick={() => setLinesOpen((v) => !v)} className={linesOpen ? GLASS_BTN.replace("border-white/10", "border-accent/70").replace("text-ink", "text-accent") : GLASS_BTN} aria-pressed={linesOpen}>
              <Route size={13} aria-hidden /> Lines
            </button>
          )}
          <button type="button" onClick={() => setSpin((v) => !v)} className={GLASS_BTN} aria-pressed={spin}>
            {spin ? <Pause size={13} aria-hidden /> : <RotateCw size={13} aria-hidden />} Spin
          </button>
          {!!skiedRuns?.length && (
            <button type="button" onClick={() => setMine((v) => !v)} className={mine ? GLASS_BTN.replace("border-white/10", "border-accent/70").replace("text-ink", "text-accent") : GLASS_BTN} aria-pressed={mine}>
              <Check size={13} aria-hidden /> My runs
            </button>
          )}
          <button type="button" onClick={() => setTrails((v) => !v)} className={GLASS_BTN} aria-pressed={trails}>
            {trails ? "Hide trails" : "Show trails"}
          </button>
          <button type="button" onClick={() => setLabels((v) => !v)} className={GLASS_BTN} aria-pressed={labels}>
            {labels ? "Hide peaks" : "Show peaks"}
          </button>
          <button type="button" onClick={() => api.current?.baseView()} className={GLASS_BTN}>
            Lift base view
          </button>
          <button type="button" onClick={() => api.current?.resetView()} className={GLASS_BTN}>
            Whole resort
          </button>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-lg border border-white/10 bg-bg/75 px-3 py-1 text-xs text-ink-soft backdrop-blur sm:block">Drag to orbit · scroll to zoom · hover a run</p>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildMountainScene, DIFFICULTY } from "@/lib/mountain/buildScene";
import { createStage } from "@/lib/mountain/stage";
import type { MountainData } from "@/lib/mountain/types";

type Hover = { x: number; y: number; title: string; sub: string } | null;

export function MountainViewer({ slug }: { slug: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [hover, setHover] = useState<Hover>(null);
  const [spin, setSpin] = useState(true);
  const [labels, setLabels] = useState(true);
  const [trails, setTrails] = useState(true);
  const api = useRef<{ setSpin: (v: boolean) => void; setLabels: (v: boolean) => void; setTrails: (v: boolean) => void; resetView: () => void; baseView: () => void } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    fetch(`/mountains/${slug}.json`)
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
            setHover({ ...at, title: run.name ?? "Unnamed run", sub: `${d.symbol} ${d.label}` });
          }
        } else {
          setHighlight(-1);
          setHover(null);
        }
      };

      stage.onFrame(() => {
        if (pending) {
          pick(pending);
          pending = null;
        }
      });

      api.current = {
        setSpin: (v) => (controls.autoRotate = v),
        setLabels: (v) => (labelGroup.visible = v),
        setTrails: (v) => built.runGroup.forEach((m) => (m.visible = v)),
        resetView: () => {
          stage.homeView();
          setLabels(true);
        },
        baseView: () => {
          baseView();
          setLabels(false);
        },
      };

      return () => {
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
        setHighlight(-1);
        highlightMat.dispose();
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

  return (
    <div className="relative h-[72vh] min-h-[420px] overflow-hidden rounded-4xl bg-[#e7eaed] shadow-card ring-1 ring-line">
      <div ref={host} className="absolute inset-0" />

      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center text-ink-soft">
          {status === "loading" ? (
            <span className="animate-pulse font-display text-lg">Building the mountain… 🏔️</span>
          ) : (
            <span>Couldn&apos;t load this mountain.</span>
          )}
        </div>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl bg-ink px-3 py-1.5 text-white shadow-lg"
          style={{ left: hover.x, top: hover.y, transform: "translate(12px, -110%)" }}
        >
          <div className="font-display text-sm font-semibold">{hover.title}</div>
          <div className="text-xs opacity-80">{hover.sub}</div>
        </div>
      )}

      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-1.5">
        {(["easy", "intermediate", "advanced", "expert"] as const).map((k) => (
          <span key={k} className="chip bg-white/90 text-ink shadow-sm ring-1 ring-black/5">
            <span style={{ color: DIFFICULTY[k].color }} aria-hidden>
              {DIFFICULTY[k].symbol}
            </span>
            {DIFFICULTY[k].label}
          </span>
        ))}
        <span className="chip bg-white/90 text-ink shadow-sm ring-1 ring-black/5">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#d8433b]" aria-hidden /> Lifts
        </span>
      </div>

      {status === "ready" && (
        <div className="absolute right-3 bottom-3 flex flex-wrap justify-end gap-1.5">
          <button type="button" onClick={() => setSpin((v) => !v)} className="btn-ghost px-3! py-1.5! text-sm!" aria-pressed={spin}>
            {spin ? "⏸ Spin" : "▶ Spin"}
          </button>
          <button type="button" onClick={() => setTrails((v) => !v)} className="btn-ghost px-3! py-1.5! text-sm!" aria-pressed={trails}>
            {trails ? "Hide trails" : "Show trails"}
          </button>
          <button type="button" onClick={() => setLabels((v) => !v)} className="btn-ghost px-3! py-1.5! text-sm!" aria-pressed={labels}>
            {labels ? "Hide peaks" : "Show peaks"}
          </button>
          <button type="button" onClick={() => api.current?.baseView()} className="btn-ghost px-3! py-1.5! text-sm!">
            Lift base view
          </button>
          <button type="button" onClick={() => api.current?.resetView()} className="btn-ghost px-3! py-1.5! text-sm!">
            Whole resort
          </button>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full bg-white/80 px-3 py-1 text-xs text-ink-soft sm:block">Drag to orbit · scroll to zoom · hover a run</p>
    </div>
  );
}

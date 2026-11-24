"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { StoredTrack } from "@/lib/analysis/process";
import type { Segment } from "@/lib/analysis/types";
import { buildMountainScene } from "@/lib/mountain/buildScene";
import { type Activity, buildTimeline, indexAt, type ReplayPoint } from "@/lib/mountain/replay";
import { createSkier } from "@/lib/mountain/skier";
import { createStage } from "@/lib/mountain/stage";
import type { MountainData } from "@/lib/mountain/types";

const FT = 3.28084;
const LENGTHS_MIN = [1, 3, 5];
const SPEEDS = [1, 2, 4];
const MAX_LINE_GAP_MIN = 20; // idle shorter than this between a run and a lift = lift line
const TRAIL: Record<Activity, string> = { run: "#ff4f8b", lift: "#8a90a0", skin: "#e07b39", drive: "#c4c8d0", idle: "#c4c8d0" };

interface Hud {
  clock: string;
  icon: string;
  label: string;
  verticalFt: number;
  run: number;
  runs: number;
}

interface Engine {
  setPlaying: (v: boolean) => void;
  seek: (fraction: number) => void;
  setSpeed: (v: number) => void;
  setLength: (min: number) => void;
  startRecording: () => void;
  cancelRecording: () => void;
}

export function ReplayViewer(props: { slug: string; track: StoredTrack; segments: Segment[]; timeZone: string; rider: { avatar: string; displayName: string }; title: string }) {
  const { slug, track, segments, timeZone, rider, title } = props;
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [lengthMin, setLengthMin] = useState(3);
  const [speed, setSpeed] = useState(1);
  const [hud, setHud] = useState<Hud | null>(null);
  const [recording, setRecording] = useState<null | { elapsed: number; error?: string }>(null);

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
      .catch((e) => {
        console.error(e);
        if (!disposed) setStatus("error");
      });

    function mount(el: HTMLDivElement, data: MountainData) {
      const built = buildMountainScene(data);
      const stage = createStage(el, built);
      const { scene, camera, controls, renderer } = stage;
      stage.peakLabels.visible = false;

      const tl = buildTimeline(track, segments, built.terrain, data);
      const pts = tl.points;
      const n = pts.length;
      const clockFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone });

      // Run number and idle-stretch meaning for every point, computed once.
      const runNo: number[] = [];
      let runs = 0;
      pts.forEach((pt, i) => {
        if (pt.activity === "run" && (i === 0 || pts[i - 1].segment !== pt.segment)) runs++;
        runNo.push(runs);
      });
      const idleLabel: string[] = new Array(n).fill("");
      for (let i = 0; i < n; ) {
        if (pts[i].activity !== "idle") {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < n && pts[j + 1].activity === "idle") j++;
        const mins = (pts[j].t - pts[i].t) / 60000;
        const before = i > 0 ? pts[i - 1].activity : null;
        const after = j + 1 < n ? pts[j + 1].activity : null;
        const label = after === "lift" && before !== "lift" && mins < MAX_LINE_GAP_MIN ? "In the lift line" : i === 0 ? "Getting ready" : j === n - 1 ? "Day's done!" : mins > MAX_LINE_GAP_MIN ? "Lunch break" : "Catching a breather";
        for (let k = i; k <= j; k++) idleLabel[k] = label;
        i = j + 1;
      }
      const describe = (pt: ReplayPoint, i: number) => {
        switch (pt.activity) {
          case "run":
            return { icon: "🎿", label: `Skiing ${pt.place ?? "a run"}` };
          case "lift":
            return { icon: "🚡", label: `Riding ${pt.place ?? "the lift"}` };
          case "skin":
            return { icon: "🥾", label: "Climbing under your own power" };
          case "drive":
            return { icon: "🚗", label: "Car ride" };
          default:
            return { icon: idleLabel[i] === "Lunch break" ? "🍔" : idleLabel[i] === "In the lift line" ? "⏳" : "☕", label: idleLabel[i] };
        }
      };

      // Skier + floating avatar bubble
      const skier = createSkier();
      scene.add(skier.object);
      const bubble = document.createElement("div");
      bubble.className = "flex items-center gap-1 rounded-full bg-white/95 py-0.5 pr-2.5 pl-1 text-xs font-bold text-ink shadow ring-1 ring-black/5 whitespace-nowrap";
      bubble.innerHTML = `<span style="font-size:16px"></span><span></span>`;
      (bubble.children[0] as HTMLElement).textContent = rider.avatar;
      (bubble.children[1] as HTMLElement).textContent = rider.displayName;
      const marker = new CSS2DObject(bubble);
      scene.add(marker);

      // Trail: whole day as one line, revealed progressively via instanceCount
      const trailGeo = new LineGeometry();
      trailGeo.setPositions(pts.flatMap((p) => [p.x, p.y + 4, p.z]));
      const c = new THREE.Color();
      trailGeo.setColors(pts.flatMap((p) => c.set(TRAIL[p.activity]).toArray()));
      const trailMat = new LineMaterial({ vertexColors: true, linewidth: 3, worldUnits: false, transparent: true, opacity: 0.9 });
      trailMat.resolution.set(el.clientWidth, el.clientHeight);
      built.lineMaterials.push(trailMat);
      const trail = new Line2(trailGeo, trailMat);
      trail.frustumCulled = false;
      scene.add(trail);

      // Playback state
      let lengthS = 3 * 60;
      let speedX = 1;
      let playhead = 0; // in timeline units (0..tl.rawLength)
      let isPlaying = true;
      const rate = () => (tl.rawLength / lengthS) * speedX; // timeline units per real second
      let yaw = 0;
      const pos = new THREE.Vector3();
      const sampleAt = (p: number) => {
        const i = indexAt(pts, p);
        const a = pts[i];
        const b = pts[Math.min(i + 1, n - 1)];
        const f = b.p > a.p ? Math.min(1, (p - a.p) / (b.p - a.p)) : 0;
        pos.set(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f);
        pos.y = a.activity === "lift" ? a.y + (b.y - a.y) * f : built.terrain.yAt(pos.x, pos.z);
        return { i, a, b };
      };

      // Camera: start behind the skier, then follow; swing back behind them unless the user is steering.
      {
        const { a, b } = sampleAt(0);
        yaw = Math.atan2(b.x - a.x, b.z - a.z) || 0;
        controls.target.copy(pos).add(new THREE.Vector3(0, 8, 0));
        camera.position.copy(pos).add(new THREE.Vector3(-Math.sin(yaw) * 360, 190, -Math.cos(yaw) * 360));
        controls.update();
      }
      let lastUser = -Infinity;
      controls.addEventListener("start", () => (lastUser = performance.now()));
      const sph = new THREE.Spherical();
      const offset = new THREE.Vector3();
      const lerpAngle = (from: number, to: number, k: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;

      // Recording: copy the WebGL canvas plus a burned-in HUD onto a 2D canvas and record that.
      let recorder: MediaRecorder | null = null;
      let recordStart = 0;
      const comp = document.createElement("canvas");
      const ctx = comp.getContext("2d")!;
      let hudNow: Hud | null = null;
      const drawComposite = () => {
        const src = renderer.domElement;
        const scale = Math.min(1, 1920 / src.width);
        const w = Math.round(src.width * scale);
        const h = Math.round(src.height * scale);
        if (comp.width !== w || comp.height !== h) {
          comp.width = w;
          comp.height = h;
        }
        ctx.drawImage(src, 0, 0, w, h);
        if (!hudNow) return;
        const u = w / 1280;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.beginPath();
        ctx.roundRect(24 * u, 24 * u, 430 * u, 118 * u, 22 * u);
        ctx.fill();
        ctx.fillStyle = "#1f2b4d";
        ctx.font = `600 ${30 * u}px ui-rounded, system-ui, sans-serif`;
        ctx.fillText(hudNow.clock, 44 * u, 66 * u);
        ctx.font = `500 ${20 * u}px ui-rounded, system-ui, sans-serif`;
        ctx.fillText(`${hudNow.icon} ${hudNow.label}`.slice(0, 40), 44 * u, 96 * u);
        ctx.fillStyle = "#5d6a8c";
        ctx.fillText(`⛰️ ${hudNow.verticalFt.toLocaleString()} ft · run ${hudNow.run} of ${hudNow.runs}`, 44 * u, 126 * u);
        ctx.font = `600 ${18 * u}px ui-rounded, system-ui, sans-serif`;
        ctx.fillStyle = "rgba(31,43,77,0.7)";
        ctx.fillText(title, 24 * u, h - 24 * u);
        ctx.restore();
      };
      stage.afterRender(() => {
        if (recorder) drawComposite();
      });
      const finishRecording = (save: boolean) => {
        const r = recorder;
        recorder = null;
        if (!r) return;
        r.onstop = save
          ? () => {
              const blob = new Blob(chunks, { type: r.mimeType });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${slug}-replay.${r.mimeType.includes("mp4") ? "mp4" : "webm"}`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
            }
          : null;
        r.stop();
        setRecording(null);
      };
      let chunks: Blob[] = [];

      let hudTimer = 0;
      stage.onFrame((dt) => {
        if (isPlaying) {
          playhead = Math.min(tl.rawLength, playhead + dt * rate());
          if (playhead >= tl.rawLength) {
            isPlaying = false;
            setPlaying(false);
            if (recorder) finishRecording(true);
          }
        }
        const { i, a, b } = sampleAt(playhead);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (Math.hypot(dx, dz) > 1) yaw = lerpAngle(yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
        skier.object.position.copy(pos);
        skier.object.rotation.y = yaw;
        skier.pose(a.activity, isPlaying ? dt * Math.min(2, speedX) : 0);
        marker.position.copy(pos).add(new THREE.Vector3(0, skier.height + 10, 0));
        trailGeo.instanceCount = i;

        // follow: move camera and target together, then ease the camera round behind the skier
        offset.copy(pos).add(new THREE.Vector3(0, 8, 0)).sub(controls.target);
        controls.target.add(offset);
        camera.position.add(offset);
        if (performance.now() - lastUser > 4000 && isPlaying) {
          offset.copy(camera.position).sub(controls.target);
          sph.setFromVector3(offset);
          sph.theta = lerpAngle(sph.theta, yaw + Math.PI, 1 - Math.exp(-dt * 0.7));
          camera.position.copy(controls.target).add(offset.setFromSpherical(sph));
        }

        hudTimer -= dt;
        if (hudTimer <= 0) {
          hudTimer = 0.12;
          const d = describe(a, i);
          hudNow = { clock: clockFmt.format(a.t), ...d, verticalFt: Math.round(a.verticalM * FT), run: runNo[i], runs };
          setHud(hudNow);
          setProgress(playhead / tl.rawLength);
          if (recorder) setRecording({ elapsed: (performance.now() - recordStart) / 1000 });
        }
      });

      engine.current = {
        setPlaying: (v) => {
          if (v && playhead >= tl.rawLength) playhead = 0;
          isPlaying = v;
          setPlaying(v);
        },
        seek: (f) => (playhead = Math.max(0, Math.min(1, f)) * tl.rawLength),
        setSpeed: (v) => (speedX = v),
        setLength: (min) => (lengthS = min * 60),
        startRecording: () => {
          const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
          if (!type) {
            setRecording({ elapsed: 0, error: "This browser can't record video." });
            return;
          }
          drawComposite();
          chunks = [];
          recorder = new MediaRecorder(comp.captureStream(30), { mimeType: type, videoBitsPerSecond: 5_000_000 });
          recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          recorder.start(1000);
          recordStart = performance.now();
          playhead = 0;
          speedX = 1;
          setSpeed(1);
          isPlaying = true;
          setPlaying(true);
          setRecording({ elapsed: 0 });
        },
        cancelRecording: () => finishRecording(false),
      };

      return () => {
        finishRecording(false);
        engine.current = null;
        skier.dispose();
        trailGeo.dispose();
        trailMat.dispose();
        stage.dispose();
      };
    }

    return () => {
      disposed = true;
      cleanup();
    };
  }, [slug, track, segments, timeZone, rider, title]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const total = lengthMin * 60;

  return (
    <div className="space-y-3">
      <div className="relative h-[68vh] min-h-[420px] overflow-hidden rounded-4xl bg-[#e7eaed] shadow-card ring-1 ring-line">
        <div ref={host} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center text-ink-soft">
            {status === "loading" ? <span className="animate-pulse font-display text-lg">Waxing skis… 🎿</span> : <span>Couldn&apos;t load the replay.</span>}
          </div>
        )}
        {hud && (
          <div className="pointer-events-none absolute top-3 left-3 rounded-3xl bg-white/90 px-4 py-3 shadow ring-1 ring-black/5">
            <div className="font-display text-2xl font-semibold tabular-nums">{hud.clock}</div>
            <div className="text-sm font-semibold">
              <span aria-hidden>{hud.icon}</span> {hud.label}
            </div>
            <div className="mt-1 text-xs text-ink-soft tabular-nums">
              ⛰️ {hud.verticalFt.toLocaleString()} ft · run {hud.run} of {hud.runs}
            </div>
          </div>
        )}
        {recording && (
          <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-white/95 py-1 pr-1 pl-3 text-sm font-bold shadow">
            {recording.error ? (
              <span className="text-berry">{recording.error}</span>
            ) : (
              <>
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e5484d]" aria-hidden />
                Recording {fmt(recording.elapsed)} / {fmt(total)}
              </>
            )}
            <button type="button" className="rounded-full px-2.5 py-1 text-ink-soft hover:bg-snow" onClick={() => (recording.error ? setRecording(null) : engine.current?.cancelRecording())}>
              {recording.error ? "OK" : "Cancel"}
            </button>
          </div>
        )}
      </div>

      {status === "ready" && (
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <button
            type="button"
            className="btn-primary h-11 w-11 px-0! py-0!"
            onClick={() => engine.current?.setPlaying(!playing)}
            aria-label={playing ? "Pause" : "Play"}
            disabled={!!recording && !recording.error}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(e) => engine.current?.seek(Number(e.target.value) / 1000)}
            className="min-w-40 flex-1 accent-[#2f7fe0]"
            aria-label="Replay position"
            disabled={!!recording && !recording.error}
          />
          <span className="w-24 text-sm text-ink-soft tabular-nums">
            {fmt((progress * total) / 1)} / {fmt(total)}
          </span>
          <button
            type="button"
            className="btn-ghost px-3! py-1.5! text-sm!"
            onClick={() => {
              const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
              setSpeed(next);
              engine.current?.setSpeed(next);
            }}
            aria-label="Playback speed"
            disabled={!!recording && !recording.error}
          >
            {speed}×
          </button>
          <label className="flex items-center gap-1.5 text-sm text-ink-soft">
            Length
            <select
              value={lengthMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLengthMin(v);
                engine.current?.setLength(v);
              }}
              className="rounded-full bg-white px-2 py-1.5 font-semibold text-ink ring-1 ring-line"
              disabled={!!recording && !recording.error}
            >
              {LENGTHS_MIN.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-ghost px-3! py-1.5! text-sm!" onClick={() => engine.current?.startRecording()} disabled={!!recording && !recording.error}>
            ⏺ Record video
          </button>
        </div>
      )}
    </div>
  );
}

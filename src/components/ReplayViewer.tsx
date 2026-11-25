"use client";

import { Circle, Pause, Play } from "lucide-react";
import { initials } from "@/lib/avatars";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { StoredTrack } from "@/lib/analysis/process";
import type { Segment } from "@/lib/analysis/types";
import { buildMountainScene } from "@/lib/mountain/buildScene";
import { createOccluderHider } from "@/lib/mountain/occlusion";
import { createParkTricks, type TrickFrame } from "@/lib/mountain/park";
import { type Activity, buildTimeline, indexAt, type ReplayPoint } from "@/lib/mountain/replay";
import { createSkier } from "@/lib/mountain/skier";
import { createStage } from "@/lib/mountain/stage";
import type { MountainData } from "@/lib/mountain/types";

const FT = 3.28084;
const LENGTHS_MIN = [1, 3, 5];
const SPEEDS = [1, 2, 4];
const MAX_LINE_GAP_MIN = 20; // idle shorter than this between a run and a lift = lift line
/** In the park the replay slows so each trick plays at about this many diorama meters per second. */
const TRICK_SPEED = 22;
/** ...and the camera moves in to this distance, at a three-quarter side angle so spins read. */
const PARK_CAM_DIST = 150;
const TRAIL: Record<Activity, string> = { run: "#ff4f8b", lift: "#8a90a0", skin: "#e07b39", drive: "#c4c8d0", idle: "#c4c8d0" };

interface Hud {
  clock: string;
  icon: string;
  label: string;
  verticalFt: number;
  run: number;
  runs: number;
  /** set while a park trick is playing; tricks are simulated until we can measure them */
  trick?: { label: string; source: "simulated" | "measured" };
}

interface Engine {
  setPlaying: (v: boolean) => void;
  seek: (fraction: number) => void;
  setSpeed: (v: number) => void;
  setLength: (min: number) => void;
  startRecording: () => void;
  cancelRecording: () => void;
}

type Rider = { avatar: string; displayName: string };
/** A friend who skied with the rider that day: drawn as a second skier at the same clock time. */
export type ReplayCompanion = { track: StoredTrack; segments: Segment[]; rider: Rider };
const COMPANION_COLORS = ["#ff7a59", "#a78bfa", "#34d399", "#fbbf24"];

export function ReplayViewer(props: { slug: string; track: StoredTrack; segments: Segment[]; timeZone: string; rider: Rider; title: string; companions?: ReplayCompanion[] }) {
  const { slug, track, segments, timeZone, rider, title, companions } = props;
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
      stage.lineLabels.visible = false; // the HUD names the line you are on

      const tl = buildTimeline(track, segments, built.terrain, data);
      const park = createParkTricks(built.parkFeatures, built.terrain);
      const stationHider = createOccluderHider(built.stations); // lift stations in front of the camera get out of the way
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
            return { icon: "#5cc8ff", label: `Skiing ${pt.place ?? "a run"}` };
          case "lift":
            return { icon: "#a78bfa", label: `Riding ${pt.place ?? "the lift"}` };
          case "skin":
            return { icon: "#fbbf24", label: "Climbing under your own power" };
          case "drive":
            return { icon: "#5d6678", label: "Car ride" };
          default:
            return { icon: idleLabel[i] === "In the lift line" ? "#fbbf24" : "#5d6678", label: idleLabel[i] };
        }
      };

      // Skier + floating avatar bubble
      const nameBubble = (name: string, color: string) => {
        const bubble = document.createElement("div");
        bubble.className = "flex items-center gap-1.5 rounded-full border border-white/10 bg-[#090b10]/80 py-0.5 pr-2.5 pl-0.5 text-xs font-medium text-[#e8edf5] shadow-lg backdrop-blur whitespace-nowrap";
        bubble.innerHTML = `<span style="display:inline-flex;width:20px;height:20px;border-radius:999px;align-items:center;justify-content:center;font-size:9px;font-weight:600;background:${color}26;color:${color}"></span><span></span>`;
        (bubble.children[0] as HTMLElement).textContent = initials(name);
        (bubble.children[1] as HTMLElement).textContent = name;
        const marker = new CSS2DObject(bubble);
        scene.add(marker);
        return marker;
      };
      const skier = createSkier();
      scene.add(skier.object);
      const marker = nameBubble(rider.displayName, "#5cc8ff");

      // Friends who skied that day ride along on their own tracks, matched by clock time.
      const crew = (companions ?? []).map((c, k) => {
        const color = COMPANION_COLORS[k % COMPANION_COLORS.length];
        const fig = createSkier(color);
        scene.add(fig.object);
        return { pts: buildTimeline(c.track, c.segments, built.terrain, data).points, fig, marker: nameBubble(c.rider.displayName, color), yaw: 0, pos: new THREE.Vector3() };
      });
      const placeCrew = (t: number, dt: number) => {
        for (const m of crew) {
          const P = m.pts;
          const on = P.length > 1 && t >= P[0].t && t <= P[P.length - 1].t;
          m.fig.object.visible = on;
          m.marker.visible = on;
          if (!on) continue;
          let lo = 0;
          let hi = P.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (P[mid].t <= t) lo = mid;
            else hi = mid - 1;
          }
          const a = P[lo];
          const b = P[Math.min(lo + 1, P.length - 1)];
          const f = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 0;
          m.pos.set(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f);
          m.pos.y = a.activity === "lift" ? a.y + (b.y - a.y) * f : built.terrain.yAt(m.pos.x, m.pos.z);
          if (Math.hypot(b.x - a.x, b.z - a.z) > 1) m.yaw = lerpAngle(m.yaw, Math.atan2(b.x - a.x, b.z - a.z), 1 - Math.exp(-dt * 6));
          m.fig.object.position.copy(m.pos);
          m.fig.object.rotation.y = m.yaw;
          m.fig.pose(a.activity, isPlaying ? dt * Math.min(2, speedX) : 0, null);
          m.marker.position.copy(m.pos).add(new THREE.Vector3(0, m.fig.height + 10, 0));
        }
      };

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
        const font = "Geist, ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "rgba(9,11,16,0.78)";
        ctx.beginPath();
        ctx.roundRect(24 * u, 24 * u, 430 * u, 118 * u, 14 * u);
        ctx.fill();
        ctx.fillStyle = "#e8edf5";
        ctx.font = `600 ${30 * u}px ${font}`;
        ctx.fillText(hudNow.clock, 44 * u, 66 * u);
        ctx.fillStyle = hudNow.icon;
        ctx.beginPath();
        ctx.arc(50 * u, 89 * u, 5 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e8edf5";
        ctx.font = `500 ${20 * u}px ${font}`;
        ctx.fillText(hudNow.label.slice(0, 36), 64 * u, 96 * u);
        ctx.fillStyle = "#8b95a8";
        ctx.fillText(`${hudNow.verticalFt.toLocaleString()} ft · run ${hudNow.run} of ${hudNow.runs}`, 44 * u, 126 * u);
        if (hudNow.trick) {
          ctx.fillStyle = "rgba(9,11,16,0.78)";
          ctx.beginPath();
          ctx.roundRect(24 * u, 150 * u, 430 * u, 46 * u, 12 * u);
          ctx.fill();
          ctx.fillStyle = "#5cc8ff";
          ctx.font = `600 ${20 * u}px ${font}`;
          ctx.fillText(hudNow.trick.label, 44 * u, 180 * u);
          if (hudNow.trick.source === "simulated") {
            ctx.fillStyle = "#8b95a8";
            ctx.font = `500 ${14 * u}px ${font}`;
            ctx.textAlign = "right";
            ctx.fillText("simulated", 436 * u, 179 * u);
            ctx.textAlign = "left";
          }
        }
        ctx.font = `600 ${18 * u}px ${font}`;
        ctx.fillStyle = "rgba(9,11,16,0.7)";
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
      let slow = 1; // park slow-motion factor on the playback rate
      let trick: TrickFrame | null = null;
      let parkBlend = 0; // 0 = normal follow camera, 1 = close park camera
      let normalRadius = 0;
      let parkDir = 0; // smoothed direction down the park, steadier than the skier's yaw in a pipe
      let inPipe = false; // pipe walls hide a side view: film it from high behind instead
      stage.onFrame((dt) => {
        if (isPlaying) {
          playhead = Math.min(tl.rawLength, playhead + dt * rate() * slow);
          if (playhead >= tl.rawLength) {
            isPlaying = false;
            setPlaying(false);
            if (recorder) finishRecording(true);
          }
        }
        const { i, a, b } = sampleAt(playhead);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const travel = Math.atan2(dx, dz);

        // Park: put the skier on the feature and slow down so the trick is watchable.
        trick = null;
        let slowTarget = 1;
        let inPark = false;
        if (park.count && a.activity === "run" && Math.hypot(dx, dz) > 1) {
          trick = park.at(pos.x, pos.z, travel, a.segment);
          inPark = !!trick || park.near(pos.x, pos.z, travel);
          if (inPark) {
            const metersPerS = Math.hypot(dx, dz) / Math.max(0.5, (b.t - a.t) / 1000);
            slowTarget = Math.min(1, TRICK_SPEED / Math.max(1, metersPerS * rate()));
          }
        }
        // drop into slow motion at once (or we'd fly past the feature), ease back out
        slow = slowTarget < slow ? slowTarget : slow + (slowTarget - slow) * (1 - Math.exp(-dt * 2.5));
        if (trick) {
          pos.set(trick.position.x, trick.position.y, trick.position.z);
          yaw = lerpAngle(yaw, trick.heading, 1 - Math.exp(-dt * 20));
        } else if (Math.hypot(dx, dz) > 1) yaw = lerpAngle(yaw, travel, 1 - Math.exp(-dt * 6));
        skier.object.position.copy(pos);
        skier.object.rotation.y = yaw;
        skier.pose(a.activity, isPlaying ? dt * Math.min(2, speedX) : 0, trick);
        marker.position.copy(pos).add(new THREE.Vector3(0, skier.height + 10, 0));
        if (crew.length) placeCrew(a.t + (b.t - a.t) * (b.p > a.p ? Math.min(1, (playhead - a.p) / (b.p - a.p)) : 0), dt);
        trailGeo.instanceCount = i;

        // follow: move camera and target together, then ease the camera round behind the skier
        offset.copy(pos).add(new THREE.Vector3(0, 8, 0)).sub(controls.target);
        controls.target.add(offset);
        camera.position.add(offset);
        parkBlend += ((inPark ? 1 : 0) - parkBlend) * (1 - Math.exp(-dt * 2.5));
        if (trick) inPipe = trick.feature === "pipe";
        if (inPark) parkDir = lerpAngle(parkDir, travel, 1 - Math.exp(-dt * 2));
        else parkDir = yaw;
        if (performance.now() - lastUser > 4000 && isPlaying) {
          offset.copy(camera.position).sub(controls.target);
          sph.setFromVector3(offset);
          if (parkBlend < 0.02) normalRadius = sph.radius;
          // behind the skier normally; in the park, swing round to a three-quarter side view, closer and lower
          const behind = (parkBlend > 0.02 ? parkDir : yaw) + Math.PI * (1 - (inPipe ? 0.12 : 0.4) * parkBlend);
          sph.theta = lerpAngle(sph.theta, behind, 1 - Math.exp(-dt * (0.7 + 2 * parkBlend)));
          sph.radius = normalRadius + ((inPipe ? PARK_CAM_DIST * 1.3 : PARK_CAM_DIST) - normalRadius) * parkBlend;
          sph.phi += ((inPipe ? 0.75 : 1.15) - sph.phi) * (1 - Math.exp(-dt * 2)) * parkBlend;
          camera.position.copy(controls.target).add(offset.setFromSpherical(sph));
        }
        stationHider.update(camera.position, controls.target);

        hudTimer -= dt;
        if (hudTimer <= 0) {
          hudTimer = 0.12;
          const d = describe(a, i);
          hudNow = { clock: clockFmt.format(a.t), ...d, verticalFt: Math.round(a.verticalM * FT), run: runNo[i], runs };
          if (trick) {
            hudNow.trick = { label: trick.trick.label, source: trick.trick.source };
            if (trick.park) hudNow.label = `Skiing ${trick.park}`; // the pipe isn't a named run
          }
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
        crew.forEach((m) => m.fig.dispose());
        trailGeo.dispose();
        trailMat.dispose();
        stage.dispose();
      };
    }

    return () => {
      disposed = true;
      cleanup();
    };
  }, [slug, track, segments, timeZone, rider, title, companions]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const total = lengthMin * 60;

  return (
    <div className="space-y-3">
      <div data-replay className="relative h-[68vh] min-h-[420px] overflow-hidden rounded-2xl border border-line bg-[#e7eaed] shadow-card">
        <div ref={host} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center text-ink-soft">
            {status === "loading" ? <span className="animate-pulse text-sm text-[#5d6678]">Loading replay…</span> : <span className="text-sm text-[#5d6678]">Couldn&apos;t load the replay.</span>}
          </div>
        )}
        {hud && (
          <div className="pointer-events-none absolute top-3 left-3 rounded-xl border border-white/10 bg-bg/80 px-4 py-3 shadow-xl backdrop-blur">
            <div className="num text-2xl font-semibold">{hud.clock}</div>
            <div className="mt-0.5 flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full" style={{ background: hud.icon }} aria-hidden /> {hud.label}
            </div>
            <div className="num mt-1 text-xs text-ink-soft">
              {hud.verticalFt.toLocaleString()} ft · run {hud.run} of {hud.runs}
            </div>
            {hud.trick && (
              <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
                <span className="text-sm font-semibold text-accent">{hud.trick.label}</span>
                {hud.trick.source === "simulated" && (
                  <span className="chip px-1.5! py-0! text-[10px]!" title="GPS shows you skied the park, not which features or spins. Tricks are illustrative until we can measure them.">
                    simulated
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {recording && (
          <div className="absolute top-3 right-3 flex items-center gap-2 rounded-lg border border-white/10 bg-bg/85 py-1 pr-1 pl-3 text-sm shadow-xl backdrop-blur">
            {recording.error ? (
              <span className="text-bad">{recording.error}</span>
            ) : (
              <>
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e5484d]" aria-hidden />
                Recording {fmt(recording.elapsed)} / {fmt(total)}
              </>
            )}
            <button type="button" className="rounded-md px-2.5 py-1 text-ink-soft hover:bg-raised" onClick={() => (recording.error ? setRecording(null) : engine.current?.cancelRecording())}>
              {recording.error ? "OK" : "Cancel"}
            </button>
          </div>
        )}
      </div>

      {status === "ready" && (
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <button
            type="button"
            className="btn-primary h-10 w-10 px-0! py-0!"
            onClick={() => engine.current?.setPlaying(!playing)}
            aria-label={playing ? "Pause" : "Play"}
            disabled={!!recording && !recording.error}
          >
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(e) => engine.current?.seek(Number(e.target.value) / 1000)}
            className="min-w-40 flex-1 accent-[#5cc8ff]"
            aria-label="Replay position"
            disabled={!!recording && !recording.error}
          />
          <span className="num w-24 text-sm text-ink-soft">
            {fmt((progress * total) / 1)} / {fmt(total)}
          </span>
          <button
            type="button"
            className="btn-ghost px-3! py-1.5!"
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
              className="rounded-lg border border-line bg-raised px-2 py-1.5 text-ink"
              disabled={!!recording && !recording.error}
            >
              {LENGTHS_MIN.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-ghost px-3! py-1.5!" onClick={() => engine.current?.startRecording()} disabled={!!recording && !recording.error}>
            <Circle size={10} fill="var(--color-bad)" className="text-bad" /> Record video
          </button>
        </div>
      )}
    </div>
  );
}

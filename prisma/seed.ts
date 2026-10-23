/**
 * Demo data: a handful of skiers with synthetic GPS days, run through the real
 * analysis pipeline so leaderboards, day pages and charts have something to show.
 *
 *   npm run db:seed
 */
import { readFileSync } from "node:fs";
import { processGpx } from "../src/lib/analysis/process";
import { prisma } from "../src/lib/db";
import { saveDay } from "../src/lib/days";
import { backcountryDay, resortDay, rng, toGpx } from "../src/lib/sample/generate";
import type { Resort } from "../src/lib/resorts/types";

const resorts = JSON.parse(readFileSync("data/resorts.json", "utf8")) as Resort[];
const resort = (name: string) => {
  const r = resorts.find((x) => x.name === name);
  if (!r) throw new Error(`resort not found: ${name}`);
  return r;
};

type Trip = { resorts: string[]; days: number; from: string } | { backcountry: [number, number, number]; days: number; from: string };

const SKIERS: { username: string; displayName: string; avatar: string; color: string; trips: Trip[] }[] = [
  {
    username: "maya",
    displayName: "Maya",
    avatar: "🦊",
    color: "berry",
    trips: [
      { resorts: ["Vail", "Breckenridge"], days: 14, from: "2025-12-06" },
      { resorts: ["Jackson Hole Mountain Resort"], days: 4, from: "2026-02-10" },
      { resorts: ["The Remarkables Ski Area"], days: 3, from: "2026-08-08" },
    ],
  },
  {
    username: "theo",
    displayName: "Theo",
    avatar: "🐻‍❄️",
    color: "sky",
    trips: [
      { resorts: ["Whistler Blackcomb"], days: 20, from: "2025-12-01" },
      { resorts: ["Revelstoke Mountain Resort"], days: 3, from: "2026-03-02" },
    ],
  },
  {
    username: "skintrack_sam",
    displayName: "Sam",
    avatar: "🐐",
    color: "mint",
    trips: [
      { backcountry: [43.4975, -110.958, 2560], days: 12, from: "2025-12-20" }, // Teton Pass
      { resorts: ["Jackson Hole Mountain Resort"], days: 5, from: "2026-01-25" },
    ],
  },
  {
    username: "lena",
    displayName: "Lena",
    avatar: "🐧",
    color: "lilac",
    trips: [
      { resorts: ["4 Vallées – Verbier/La Tzoumaz/Nendaz/Veysonnaz/Thyon", "Zermatt - Breuil-Cervinia"], days: 9, from: "2026-01-03" },
      { resorts: ["Niseko United"], days: 5, from: "2026-02-01" },
    ],
  },
  {
    username: "jordan",
    displayName: "Jordan",
    avatar: "🏂",
    color: "sun",
    trips: [
      { resorts: ["Mammoth Mountain"], days: 10, from: "2025-12-12" },
      { resorts: ["Palisades Tahoe Olympic Valley", "Palisades Tahoe Alpine Meadows"], days: 6, from: "2026-02-14" },
    ],
  },
  {
    username: "priya",
    displayName: "Priya",
    avatar: "🦉",
    color: "peach",
    trips: [
      { resorts: ["Alta Ski Area", "Snowbird", "Park City Mountain Resort"], days: 16, from: "2025-12-15" },
      { backcountry: [40.5945, -111.6, 2700], days: 3, from: "2026-03-10" }, // Little Cottonwood
    ],
  },
  {
    username: "kai",
    displayName: "Kai",
    avatar: "🦭",
    color: "sky",
    trips: [
      { resorts: ["Stowe Mountain Resort", "Killington Resort"], days: 11, from: "2026-01-04" },
      { resorts: ["Coronet Peak", "The Remarkables Ski Area"], days: 5, from: "2026-07-20" },
    ],
  },
  {
    username: "rosie",
    displayName: "Rosie",
    avatar: "🐰",
    color: "berry",
    trips: [{ resorts: ["Big Sky Resort", "Telluride Ski Area", "Steamboat Ski Resort", "Aspen Snowmass"], days: 8, from: "2026-01-18" }],
  },
];

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  await prisma.skiDay.deleteMany();
  await prisma.user.deleteMany();

  let seed = 1;
  for (const s of SKIERS) {
    const user = await prisma.user.create({ data: { username: s.username, displayName: s.displayName, avatar: s.avatar, color: s.color } });
    let saved = 0;
    for (const trip of s.trips) {
      const rand = rng(seed++);
      let date = trip.from;
      for (let i = 0; i < trip.days; i++) {
        date = addDays(date, 1 + Math.floor(rand() * 3));
        const lon = "resorts" in trip ? resort(trip.resorts[i % trip.resorts.length]).center[0] : trip.backcountry[1];
        // ~9am local, approximated from longitude
        const start = new Date(new Date(`${date}T09:00:00Z`).getTime() - (lon / 15) * 3600_000);

        let points;
        if ("resorts" in trip) {
          const r = resort(trip.resorts[i % trip.resorts.length]);
          const span = (r.maxEle ?? 3000) - (r.minEle ?? 2300);
          const vert = Math.min(span, 750) * (0.55 + rand() * 0.35);
          const baseEle = (r.minEle ?? 2300) + rand() * Math.max(0, span - vert);
          points = resortDay({ lat: r.center[1], lon: r.center[0], baseEle, topEle: baseEle + vert, laps: 5 + Math.floor(rand() * 10), start, seed: seed++ });
        } else {
          const [lat, , ele] = trip.backcountry;
          const laps = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ gain: 300 + rand() * 500 }));
          points = backcountryDay({ lat, lon, baseEle: ele, laps, start, seed: seed++ });
        }

        for (const day of processGpx(toGpx(points)).days) {
          if ((await saveDay(user.id, day, "demo")).status === "saved") saved++;
        }
      }
    }
    console.log(`${s.displayName}: ${saved} days`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

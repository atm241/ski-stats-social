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
import type { MountainData } from "../src/lib/mountain/types";
import { backcountryDay, passLapsDay, resortDay, rng, toGpx } from "../src/lib/sample/generate";
import { mountainDay } from "../src/lib/sample/mountainDay";
import { plannedDay } from "../src/lib/sample/plannedDay";
import { PLANS } from "../src/lib/sample/plans";
import type { Resort } from "../src/lib/resorts/types";

const resorts = JSON.parse(readFileSync("data/resorts.json", "utf8")) as Resort[];
const resort = (name: string) => {
  const r = resorts.find((x) => x.name === name);
  if (!r) throw new Error(`resort not found: ${name}`);
  return r;
};

type Trip =
  | { resorts: string[]; days: number; from: string }
  | { backcountry: [number, number, number]; days: number; from: string }
  /** real lift & run network from public/mountains/<slug>.json, so the day can be replayed in 3D */
  | { mountain: string; days: number; from: string; parkLaps?: number }
  /** ride along with another demo skier's mountain days (same route, `lagS` behind), for "Skied with" */
  | { mountain: string; days: number; withUser: string; lagS: number }
  /** one hand-written day from src/lib/sample/plans.ts (e.g. Keystone's Outback + A51) */
  | { plan: string; days: 1; from: string };

const mountain = (slug: string) => JSON.parse(readFileSync(`public/mountains/${slug}.json`, "utf8")) as MountainData;

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
  {
    username: "dana",
    displayName: "Dana",
    avatar: "🦊",
    color: "sky",
    trips: [
      { mountain: "deer-valley", days: 6, from: "2026-01-10" },
      { mountain: "snowbird-alta", days: 3, from: "2026-02-14" },
      { mountain: "park-city", days: 3, from: "2026-03-06", parkLaps: 4 },
      { plan: "keystone-outback-a51", days: 1, from: "2026-02-06" },
      { plan: "park-city-jupiter-to-canyons", days: 1, from: "2026-03-12" },
    ],
  },
  {
    username: "alex",
    displayName: "Alex Moreno",
    avatar: "🏂",
    color: "peach",
    trips: [{ mountain: "snowbird-alta", days: 2, withUser: "dana", lagS: 5 }], // a chair behind: same lifts, same runs
  },
];

/** Mountain days already generated per "user:slug", so a buddy can replay the same route. */
const generatedDays = new Map<string, { date: string; start: Date; seed: number; laps: number }[]>();

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  // Only demo skiers (no email) are replaced; real accounts and their days are left alone.
  await prisma.user.deleteMany({ where: { email: null } });

  let seed = 1;
  for (const s of SKIERS) {
    // demo skiers are on the public board, except Sam, who keeps to friends
    const user = await prisma.user.create({ data: { username: s.username, displayName: s.displayName, avatar: s.avatar, color: s.color, globalBoard: s.username !== "skintrack_sam" } });
    let saved = 0;
    for (const trip of s.trips) {
      const rand = rng(seed++);
      let date = "from" in trip ? trip.from : "";
      for (let i = 0; i < trip.days; i++) {
        const along = "withUser" in trip ? generatedDays.get(`${trip.withUser}:${trip.mountain}`)?.[i] : undefined;
        if ("withUser" in trip && !along) break;
        date = along ? along.date : addDays(date, 1 + Math.floor(rand() * 3));
        const lon = "resorts" in trip ? resort(trip.resorts[i % trip.resorts.length]).center[0] : "backcountry" in trip ? trip.backcountry[1] : -111.5;
        // ~9am local, approximated from longitude
        const start = new Date(new Date(`${date}T09:00:00Z`).getTime() - (lon / 15) * 3600_000);

        let points;
        if ("plan" in trip) {
          const p = PLANS[trip.plan];
          points = plannedDay(mountain(p.mountain), { start, seed: seed++, plan: p.plan, endAt: p.endAt }).points;
        } else if ("mountain" in trip) {
          const params = along
            ? { start: new Date(along.start.getTime() + ("lagS" in trip ? trip.lagS : 0) * 1000), seed: along.seed, laps: along.laps }
            : { start, seed: seed++, laps: 7 + Math.floor(rand() * 6), parkLaps: "parkLaps" in trip && i === 0 ? trip.parkLaps : 0 };
          if (!along) {
            const key = `${s.username}:${trip.mountain}`;
            generatedDays.set(key, [...(generatedDays.get(key) ?? []), { date, ...params }]);
          }
          points = mountainDay(mountain(trip.mountain), params).points;
        } else if ("resorts" in trip) {
          const r = resort(trip.resorts[i % trip.resorts.length]);
          const span = (r.maxEle ?? 3000) - (r.minEle ?? 2300);
          const vert = Math.min(span, 750) * (0.55 + rand() * 0.35);
          const baseEle = (r.minEle ?? 2300) + rand() * Math.max(0, span - vert);
          points = resortDay({ lat: r.center[1], lon: r.center[0], baseEle, topEle: baseEle + vert, laps: 5 + Math.floor(rand() * 10), start, seed: seed++ });
        } else {
          const [lat, , ele] = trip.backcountry;
          const laps = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ gain: 300 + rand() * 500, bootpack: rand() < 0.3 }));
          // Some pass days are hitchhiked laps instead of a tour.
          points =
            rand() < 0.35
              ? passLapsDay({ lat, lon, topEle: ele, laps: 3 + Math.floor(rand() * 4), drop: 350 + rand() * 200, start, carSpeed: 6 + rand() * 8, seed: seed++ })
              : backcountryDay({ lat, lon, baseEle: ele, laps, start, seed: seed++ });
        }

        for (const day of processGpx(toGpx(points)).days) {
          if ((await saveDay(user.id, day, "demo")).status === "saved") saved++;
        }
      }
    }
    console.log(`${s.displayName}: ${saved} days`);
  }

  // Friends are mutual follows; Rosie follows Dana without being followed back (so she's not a friend).
  const ids = new Map((await prisma.user.findMany({ where: { email: null }, select: { id: true, username: true } })).map((u) => [u.username, u.id]));
  const follow = (a: string, b: string) => prisma.follow.create({ data: { followerId: ids.get(a)!, followingId: ids.get(b)! } });
  for (const [a, b] of FRIENDS) await Promise.all([follow(a, b), follow(b, a)]);
  await follow("rosie", "dana");

  // Friends comment on each other's days and like each other's runs; steep named lines get the most love.
  const social = rng(77);
  const friendsOf = (u: string) => FRIENDS.flatMap(([a, b]) => (a === u ? [b] : b === u ? [a] : []));
  const days = await prisma.skiDay.findMany({ where: { user: { email: null } }, include: { user: true, runs: true } });
  let comments = 0;
  let likes = 0;
  for (const day of days) {
    const crew = friendsOf(day.user.username);
    if (!crew.length) continue;
    for (const who of crew) {
      if (social() < 0.35) {
        await prisma.comment.create({ data: { dayId: day.id, userId: ids.get(who)!, body: COMMENTS[Math.floor(social() * COMMENTS.length)], createdAt: new Date(day.endedAt.getTime() + (1 + social() * 20) * 3600_000) } });
        comments++;
      }
      for (const run of day.runs) {
        const steep = run.difficulty === "expert" || run.difficulty === "extreme" || run.difficulty === "freeride" ? 0.55 : run.difficulty === "advanced" ? 0.2 : 0.05;
        if (social() < steep) {
          await prisma.runLike.create({ data: { userId: ids.get(who)!, runId: run.id } });
          await prisma.run.update({ where: { id: run.id }, data: { likeCount: { increment: 1 } } });
          likes++;
        }
      }
    }
  }
  console.log(`social: ${comments} comments, ${likes} run likes`);
}

const COMMENTS = [
  "Send it!",
  "That last lap was the move.",
  "Jealous. Work was brutal today.",
  "How was the snow up top?",
  "Absolute legs of steel.",
  "Saving me a chair next time?",
  "That line looked spicy from the lift.",
  "Big day. Après was earned.",
];

const FRIENDS: [string, string][] = [
  ["dana", "alex"],
  ["dana", "priya"],
  ["priya", "kai"],
  ["maya", "theo"],
  ["lena", "jordan"],
];

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

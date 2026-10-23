# Pow Pals (working name)

A ski social app and global leaderboard: vertical feet, days skied and unique resorts, resort and backcountry.

## Run it

```bash
npm install
cp .env.example .env
npm run db:push      # create the SQLite database
npm run db:seed      # demo skiers with synthetic days
npm run dev          # http://localhost:3000
```

`npm test` runs the analysis tests. `samples/` has GPX files you can try in the uploader
(`npx tsx scripts/make-samples.ts` regenerates them).

## How it works

- **Data in:** GPX upload (`/upload` → `POST /api/uploads`). Every tracker can export GPX (Slopes, Garmin, Strava, Apple Watch via HealthFit). Neither Epic nor Ikon offers a public API.
- **We measure, not the source app:** `src/lib/analysis/analyze.ts` smooths altitude, splits the day into up/down legs and classifies lifts, runs, skinning and driving. Vertical = total descent on runs. The same rules apply to everyone, which keeps the leaderboard fair.
- **Resort detection:** `data/resorts.json` (~4,900 operating downhill areas, built from OpenSkiMap by `scripts/build-resorts.ts`), point-in-polygon with majority vote.
- **Cheat guards:** car rides are excluded, and impossible speeds, lift rates or daily vertical flag a day off the leaderboard. Overlapping uploads are rejected as duplicates.
- **Derived stats** (ski/lift/lift-line time, longest & tallest run, peak altitude) come from stored segments in `src/lib/analysis/extras.ts`. After changing that logic, run `npx tsx scripts/backfill-day-stats.ts` to recompute existing days.
- **Seasons:** July–June, keyed `2025-26`; southern-hemisphere June days roll forward (`src/lib/season.ts`).

## Before deploying

- Replace the dev cookie sign-in (`src/lib/auth.ts`) with real auth.
- Switch Prisma to Postgres (`prisma/schema.prisma` provider + `DATABASE_URL`).
- Leaderboard aggregates in memory (`src/lib/days.ts`); move it to SQL or a per-season totals table as users grow.

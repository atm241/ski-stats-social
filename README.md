# Gapr

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

## Stats (Slopes-style) and friends

- **Named runs and lifts:** at resorts with a 3D mountain, every run and lift ride is matched to the trail map. `src/lib/trails.ts` has each GPS point vote for the nearest named trail or lift within 60 m. A run gets its main trail, the chain of trails skied in order, and a difficulty. Labels are computed on the fly, so rebuilding a mountain updates old days.
- **Day page** (`/days/<id>`), centred on `src/components/DayExplorer.tsx`: an altitude/speed profile, a map, and a timeline of lift rides (with line waits), runs (trails, difficulty, vertical, distance, time, avg/top speed) and breaks. Selecting a run anywhere highlights it everywhere and zooms the map. The page also shows where the time went, the terrain mix by difficulty, the most-skied trails and lifts, and **Skied with**: other people's days at the same resort and date with a lift ride starting within 2 minutes and 120 m of yours (`src/lib/social.ts`).
- **Season stats** (`/u/<username>`): totals, a vertical-by-day chart with monthly totals, personal bests, terrain mix, most-skied trails, lifts and time in lift lines (`src/lib/stats.ts`), plus resorts.
- **Friends:** one-way follows (`Follow` model). The home feed and the leaderboard's Friends tab show you plus people you follow.
- **Look:** a dark, data-first theme (`src/app/globals.css`) with Geist and Geist Mono, lucide icons and monogram avatars. `User.avatar` still stores the old emoji but isn't shown.

## 3D mountains and day replays

- `npx tsx scripts/build-all.ts <slug> [--debug <dir>]` builds a mountain listed in `scripts/mountains.config.ts` (built so far: `deer-valley`, `snowbird-alta`, `park-city`, `a-basin`). Each entry names the resorts it combines, its landmarks, and any hand-placed park features. The steps can also run on their own:
  - `build-mountain.ts`: terrain height grid (AWS Terrain Tiles) plus runs, lifts and peaks from OpenStreetMap. Features inside a neighbouring resort's outline are dropped.
  - `build-forest.ts`: where trees are and what kind. Tree cover comes from ESA WorldCover (10 m). Evergreen vs. leafless is decided by recent summer vs. late-fall Sentinel-2 greenness (NDVI). Among leafless trees, aspen vs. scrub oak/maple is decided by Meta/WRI's 1 m canopy height map. Recent summers also drop trees cleared for runs since 2021. Not ground-truthed; checked against peak-fall-colour satellite photos.
  - `build-cliffs.ts`: exposed rock from USGS 3DEP lidar (US only), sampled at 2 m. A pixel counts as rock when it is steep both locally (≥ 42°) and over a 12 m baseline (≥ 37°); road cuts and foundations near OSM roads and buildings are ignored. Rock is grouped into 8 m cells with elevation, facing, steepness and face height. The scene draws an outcrop on each cell and greys the snow around it.
  - `build-parks.ts`: terrain parks and halfpipes from OSM (`piste:type=snow_park`, or runs described as terrain parks) plus config entries, and resolves landmarks. Quick to re-run after editing the config.
- Park City's new superpipe isn't in OSM yet. It is placed on the earthwork that appears in Aug–Sep 2026 Sentinel-2 imagery, beside 3 Kings / Pick'n Shovel above the base. Move it in the config once OSM maps it.
- Overpass (OSM) is often at capacity; `scripts/lib/overpass.ts` retries with backoff across mirrors.
- The viewer opens looking from the side the runs face, and has fly-to buttons for each landmark (cliffs, parks, peaks). Cliff outcrops skip mapped runs, so chutes stay snow, and thin out on 42–50° faces that hold snow in winter.
- `/mountains/<slug>` is the low-poly explorer (`src/lib/mountain/buildScene.ts`, `stage.ts`); `/days/<id>/replay` animates a day on it (`replay.ts` timeline, `skier.ts`, `ReplayViewer.tsx`), including in-browser video recording.
- `src/lib/sample/mountainDay.ts` generates synthetic days on a real lift/run network; the seed gives demo skier "Dana" days at Deer Valley, Snowbird/Alta and Park City, and "Alex" rides along on two of her Snowbird/Alta days to demo "Skied with".

## Accounts and getting data in

- **Sign-in:** email magic link (`src/lib/magicLink.ts`). Links are single-use, expire in 15 minutes, and are redeemed by a button POST so email scanners can't burn them. Sessions are database-backed; only token hashes are stored. Without `RESEND_API_KEY`, emails print to the server console and the login page shows the link (dev only). Demo skiers can be signed into from `/login` in dev.
- **Email-to-upload:** each account gets `<token>@INBOUND_DOMAIN` (shown in `/settings`). Inbound mail arrives via Postmark's webhook at `/api/inbound/postmark`, GPX attachments go through the same `ingestFile` pipeline as web uploads, every file is logged in `Upload`, and a receipt goes to the account's own email. Try it locally: `npx tsx --env-file=.env scripts/send-test-email.ts <your-upload-address>`.
- **Apple Watch / iPhone (no Strava):** two routes. (1) *Apple Health export*: on `/upload`, pick the `export.zip` from Health → Export All Health Data. It's read in the browser (`src/lib/healthExport.ts`, streamed with fflate); only skiing/snowboarding workout routes are extracted and uploaded. (2) *iPhone sync app* (`ios/PowPalsSync`): reads ski workouts and routes from HealthKit and uploads new ones automatically using a personal token from Settings → iPhone sync (`ApiToken`, `Authorization: Bearer pp_…`, only hashes stored). Apple routes carry GPS Doppler speed and accuracy; the parser drops fixes with hAcc > 50 m and top speed uses device speed (median of 3) when present.
- **Not supported (by design, for now):** Strava (its API terms only allow showing data to its owner, not leaderboards), Slopes (no API), Garmin (developer program paused). Apple Health / Health Connect need a native app.

## Before deploying

- Set `APP_URL`, `RESEND_API_KEY` + `EMAIL_FROM` (verified sending domain), and `INBOUND_WEBHOOK_SECRET`.
- Inbound email: point an MX record for `INBOUND_DOMAIN` (e.g. `upload.yourdomain.com`) at Postmark inbound, and set the Postmark webhook to `https://inbound:<secret>@yourdomain.com/api/inbound/postmark`.
- Switch Prisma to Postgres (`prisma/schema.prisma` provider + `DATABASE_URL`).
- Leaderboard aggregates in memory (`src/lib/days.ts`); move it to SQL or a per-season totals table as users grow.

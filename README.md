# Gapr

A ski social app and global leaderboard: vertical feet, days skied and unique resorts, resort and backcountry. Named runs on 3D mountains, day replays, friends, comments, run likes and per-trail leaderboards. A web app (Next.js) and a phone app (Expo, in `mobile/`) share one API.

## Run it

Needs Node 24 (`nvm use`) and Docker.

```bash
npm install            # also generates the Prisma client
cp .env.example .env
npm run db:up          # Postgres in Docker on port 5434 (plus a gapr_test database for tests)
npm run db:deploy      # apply migrations
npm run db:seed        # demo skiers with synthetic days, follows, comments and likes
npm run dev -- -p 3100 # http://localhost:3100
```

In development, `/login` has one-click sign-in buttons for the demo skiers.

| Command | What it does |
|---|---|
| `npm run check` | lint, typecheck, unit + database tests, production build (what CI runs first) |
| `npm test` | Vitest: `unit` (pure logic) and `db` (`*.db.test.ts`, against `gapr_test`) |
| `npm run e2e` | Playwright browser tests against the dev server and seeded data (uses your installed Chrome) |
| `npm run db:migrate -- --name <change>` | after editing `prisma/schema.prisma`: write and apply a migration |
| `npm run db:reset` | wipe the dev database, re-apply migrations, reseed |
| `npm run runs:reindex [-- <slug>]` | re-label saved days after rebuilding a mountain (see "Run index") |
| `npm run mountains:index` | rewrite `public/mountains/index.json` |
| `npm run totals:rebuild` | recompute stored season totals (leaderboards) |

`samples/` has GPX files to try in the uploader (`npx tsx scripts/make-samples.ts` regenerates them).

## Layout

- `src/app`: pages, server actions (`actions.ts`) and the JSON API (`api/`).
- `src/lib`: everything else. Pure logic (analysis, trails, completion, togetherness, 3D scene) is unit tested; server modules (`server-only`) talk to the database.
- `src/lib/views.ts`: what the day, profile and feed screens show. **Web pages and API routes both read from here**, so the web and phone apps can't drift apart; each only decides presentation.
- `src/lib/apiTypes.ts`: the API's response types, imported by the phone app as `@shared/apiTypes`.
- `mobile/`: the Expo app (see `mobile/AGENTS.md`). Apple Health needs a development build, not Expo Go: `cd mobile && npx expo run:ios` (simulator; needs CocoaPods) or `eas build --profile development`. Dev builds have a button that writes a test ski day into Health.
- `scripts/`: mountain builders and one-off maintenance.
- `e2e/`: Playwright tests.

## How it works

- **Data in:** GPX upload (`/upload` → `POST /api/uploads`), email-to-upload, the Apple Health export, or Apple Health sync in the phone app. Every tracker can export GPX. Neither Epic nor Ikon offers a public API.
- **We measure, not the source app:** `src/lib/analysis/analyze.ts` smooths altitude, splits the day into up/down legs and classifies lifts, runs, skinning and driving. Vertical = total descent on runs. The same rules apply to everyone, which keeps the leaderboard fair.
- **Resort detection:** `data/resorts.json` (~4,900 operating downhill areas from OpenSkiMap, built by `scripts/build-resorts.ts`), point-in-polygon with majority vote.
- **Cheat guards:** car rides are excluded; impossible speeds, lift rates or daily vertical flag a day off the leaderboards. Overlapping uploads are rejected as duplicates.
- **Seasons:** July–June, keyed `2025-26`; southern-hemisphere June days roll forward (`src/lib/season.ts`).

### Run index

When a day is saved, `indexRuns` (`src/lib/runs.ts`) matches it to the trail map once and stores the result: a `Run` per named run, a `RunTrail` per trail along it (with the top speed while on that trail), and a `LiftRide` per named lift ride. Profile and mountain stats, "ski every run" completion, trail leaderboards and likes all read these tables, so no page parses GPS tracks except the day page and the replay. Rebuilding a mountain changes trail names and shapes, so run `npm run runs:reindex -- <slug>` afterwards (likes survive).

GPS tracks are the big columns, and the Prisma client never loads them unless a query asks (`omit: WITH_TRACK`, see `src/lib/db.ts`).

### Social

- **Friends** are mutual follows. Invite links (`/invite/<code>`) make two people friends in one tap; `/people` has search and suggestions.
- **Skied with** (`src/lib/together.ts`): a friend's day at the same resort and date counts when you rode lifts together (within 40 m for most of the ride) or skied runs together (within 90 m for most of the run). Friends only; strangers on the next chair never show up.
- **Leaderboards:** the public board is opt-in (Settings); the friends board shows you and your friends. Both read `SeasonTotal`, one row per skier and season, refreshed whenever a day is saved or deleted, so a board is one sorted query (top 100, plus your own rank). Trail boards (`/mountains/<slug>/runs/<trail>`) rank the fastest skiers on that trail and the most-liked runs down it.
- **Comments and likes:** anyone signed in can comment on a day (rate-limited) and like other people's runs.
- **Privacy** (`src/lib/privacy.ts`): each day is public, friends-only or private. New accounts start friends-only (Settings changes the default, optionally for past days too), and each day can be changed on its page. Every read path filters through it: day pages, replays, feeds, profiles, mountain pages, "skied with", comments and likes; hidden days 404 rather than say they exist. Private days still count toward totals and leaderboards. Trail boards rank public days only. Other people see tracks without their first and last 400 m (`src/lib/trackPrivacy.ts`) unless the owner turns that off. The phone app's replay web view sends its token as a header, so friends-only replays load there too.
- **Invites** carry you back: signing in from `/invite/<code>` returns to it (`?next=`, same-site paths only, `src/lib/nextPath.ts`), through the emailed link too.

### 3D mountains and replays

- `npx tsx scripts/build-all.ts <slug>` builds a mountain listed in `scripts/mountains.config.ts` (54 so far, including the large Epic and Ikon resorts). The steps can also run on their own:
  - `build-mountain.ts`: terrain height grid (AWS Terrain Tiles) plus runs, lifts and peaks from OpenStreetMap. Resorts mapped as a point only get a padded box around it.
  - `build-forest.ts`: tree cover from ESA WorldCover (10 m); evergreen vs. leafless from summer vs. late-fall Sentinel-2 greenness; aspen vs. scrub from Meta/WRI's 1 m canopy height.
  - `build-cliffs.ts`: exposed rock from USGS 3DEP lidar (2 m) in the US; elsewhere, or where lidar covers under half the area, the coarser AWS Terrarium DEM.
  - `build-parks.ts`: terrain parks and halfpipes from OSM and the config, and landmark positions.
- The scene: `src/lib/mountain/buildScene.ts` assembles it from `props.ts` (low-poly trees, outcrops, park features), `views.ts` (camera views, named lines) and the terrain. `stage.ts` renders it. Named lines (Corbet's, Chimney, McConkey's…) are labelled when the camera is close.
- `/days/<id>/replay` animates a day on the mountain, with friends who skied with you riding along.
- **Hosting the files:** they're served from `public/mountains` (gzipped by Next, cached for an hour). In production, set `NEXT_PUBLIC_MOUNTAINS_URL` to a CDN or bucket holding the same files; the browser and the server then both read from there (`src/lib/mountain/source.ts`, `registry.ts`).

## Accounts

- **Sign-in:** email magic link (`src/lib/magicLink.ts`). Single-use, 15-minute links, redeemed by a button POST so email scanners can't burn them. Database-backed sessions; only token hashes are stored. Without `RESEND_API_KEY`, emails print to the server console.
- **Phone app:** signs in with the same email link, which hands it an API token (`gapr://auth?token=pp_…`). The API accepts `Authorization: Bearer pp_…` or the session cookie.
- **Email-to-upload:** each account gets `<token>@INBOUND_DOMAIN` (in Settings). Postmark's inbound webhook hits `/api/inbound/postmark`; attachments go through the same pipeline as uploads.
- **Apple Watch / iPhone:** the Health export on `/upload` (read in the browser), or the phone app's Apple Health sync (`mobile/src/lib/health.ts`): ski and snowboard workouts and their GPS routes become GPX (`src/lib/gpx/fromLocations.ts`) and go to `POST /api/uploads` as JSON. New workouts sync through HealthKit background delivery and whenever the app opens; the server skips days it already has.
- **Account deletion** (Settings, or `DELETE /api/me`) removes everything, including likes and comments on other people's days.
- **Rate limits** (sign-in emails, uploads, comments) are kept in Postgres, so they hold across server instances.

## Before deploying

- A hosted Postgres; set `DATABASE_URL` and run `npm run db:deploy` on each release.
- Set `APP_URL`, `RESEND_API_KEY` + `EMAIL_FROM` (verified sending domain), and `INBOUND_WEBHOOK_SECRET`.
- Upload `public/mountains` to a CDN or bucket and set `NEXT_PUBLIC_MOUNTAINS_URL`.
- Inbound email: an MX record for `INBOUND_DOMAIN` pointing at Postmark inbound, and the Postmark webhook at `https://inbound:<secret>@yourdomain.com/api/inbound/postmark`.

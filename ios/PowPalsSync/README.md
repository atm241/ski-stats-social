# Pow Pals Sync (iPhone)

Uploads your Apple Watch / iPhone **skiing and snowboarding workouts** to Pow Pals automatically: no Strava, no manual exports. It reads only workouts and their GPS routes from HealthKit (read-only), turns each route into GPX with the watch's own GPS speed and accuracy, and posts it to `/api/uploads` with a personal token. The server analyses it like any other upload: runs, lifts, named trails, vertical, top speed.

## Run it

1. `brew install xcodegen` (once), then `cd ios/PowPalsSync && xcodegen generate` after changing `project.yml` (the generated `.xcodeproj` is committed, so you can also just open it).
2. Open `PowPalsSync.xcodeproj`, pick your team under Signing & Capabilities, and run on your iPhone. HealthKit needs a real device for your actual workouts. The simulator runs the app but has no ski workouts.
3. On the website: **Settings → iPhone sync → Create token**. In the app enter the server URL (a deployed URL, or your Mac's LAN address like `http://192.168.1.20:3100` while developing; `localhost` only works in the simulator) and paste the token.
4. Tap **Allow access to ski workouts**, then **Sync now**. After that, new workouts sync in the background via HealthKit background delivery.

Record days with the Apple Watch Workout app's **Downhill Skiing** or **Snowboarding** type (or any app that saves those workout types with a route to Health, such as Slopes).

## Notes

- HealthKit capabilities need a signing team. Some HealthKit features may need a paid Apple Developer Program membership; if Xcode won't enable the capability with a free Apple ID, that's why.
- Workouts already sent are remembered on the device, and the server also rejects overlapping duplicate days, so re-syncing is safe.
- `xcodebuild test -scheme PowPalsSync -destination 'platform=iOS Simulator,name=iPhone 16'` runs the GPX tests.

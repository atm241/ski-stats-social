import { requireUser } from "@/lib/auth";
import { Uploader } from "./Uploader";

const GUIDES = [
  {
    app: "Slopes",
    icon: "📱",
    steps: "Logbook → open a day → ••• menu → Export As → GPX (choose “Active Time” or “All Day”).",
  },
  {
    app: "Garmin",
    icon: "⌚",
    steps: "Garmin Connect (web) → Activities → open the ski activity → ⚙️ → Export to GPX.",
  },
  {
    app: "Strava",
    icon: "🟠",
    steps: "strava.com → open the activity → ••• → Export GPX.",
  },
  {
    app: "Apple Watch / Health",
    icon: "❤️",
    steps: "Health doesn't export GPX directly. Use an app like HealthFit or RunGap to export the workout as GPX.",
  },
];

export default async function UploadPage() {
  await requireUser();
  return (
    <div className="grid gap-6 pt-2 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-1 font-display text-3xl font-bold">Upload ski days</h1>
        <p className="mb-5 text-ink-soft">
          We measure every day from the raw GPS track with the same rules, so vertical is fair no matter which app you used.
        </p>
        <Uploader />
      </section>
      <aside className="space-y-3">
        <h2 className="font-display text-lg font-semibold">How to get a GPX file</h2>
        {GUIDES.map((g) => (
          <div key={g.app} className="card p-4">
            <div className="mb-1 font-display font-semibold">
              <span aria-hidden>{g.icon}</span> {g.app}
            </div>
            <p className="text-sm text-ink-soft">{g.steps}</p>
          </div>
        ))}
        <p className="text-xs text-ink-soft">The file needs timestamps and elevation. Car rides are left out automatically, and days with impossible numbers are flagged and kept off the leaderboard.</p>
      </aside>
    </div>
  );
}

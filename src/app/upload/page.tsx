import { requireUser } from "@/lib/auth";
import { SectionTitle } from "@/components/ui";
import { HealthImport } from "./HealthImport";
import { Uploader } from "./Uploader";

const GUIDES = [
  { app: "Slopes", steps: "Logbook → open a day → ••• → Export As → GPX (Active Time or All Day)." },
  { app: "Garmin", steps: "Garmin Connect (web) → Activities → open the ski activity → settings → Export to GPX." },
  { app: "Strava", steps: "strava.com → open the activity → ••• → Export GPX." },
  { app: "Apple Watch", steps: "Use the Apple Health import above, or the Pow Pals iPhone app to sync automatically after each workout." },
];

export default async function UploadPage() {
  await requireUser();
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Upload days</h1>
        <p className="mt-1 mb-6 text-sm text-ink-soft">Every day is measured from the raw GPS track with the same rules, so vertical is fair no matter which app recorded it.</p>
        <div className="space-y-6">
          <HealthImport />
          <div>
            <div className="label mb-3">Or any GPX file</div>
            <Uploader />
          </div>
        </div>
      </section>
      <aside>
        <SectionTitle>Getting a GPX file</SectionTitle>
        <ul className="card divide-y divide-line overflow-hidden">
          {GUIDES.map((g) => (
            <li key={g.app} className="p-4">
              <div className="text-sm font-medium">{g.app}</div>
              <p className="mt-1 text-sm text-ink-soft">{g.steps}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-faint">Files need timestamps and elevation. Car rides are left out automatically; days with impossible numbers are flagged and kept off the leaderboard.</p>
      </aside>
    </div>
  );
}

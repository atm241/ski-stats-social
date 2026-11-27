"use client";

import { useActionState } from "react";
import { VISIBILITIES, VISIBILITY_HINT, VISIBILITY_LABEL, type Visibility } from "@/lib/visibility";
import { type PrivacyState, savePrivacyAction } from "../actions";

/** Who sees new days (optionally all past ones too), and whether other people see your tracks' ends. */
export function PrivacyForm({ defaultVisibility, hideTrackEnds }: { defaultVisibility: Visibility; hideTrackEnds: boolean }) {
  const [state, action, pending] = useActionState<PrivacyState, FormData>(savePrivacyAction, {});
  return (
    <form action={action} className="card space-y-5 p-5 text-sm">
      <fieldset>
        <legend className="font-medium">Who sees your new days</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {VISIBILITIES.map((v) => (
            <label key={v} className="card-raised flex cursor-pointer gap-2.5 p-3 has-[:checked]:border-accent">
              <input type="radio" name="defaultVisibility" value={v} defaultChecked={v === defaultVisibility} className="mt-0.5 accent-[var(--color-accent)]" />
              <span>
                <span className="block font-medium">{VISIBILITY_LABEL[v]}</span>
                <span className="block text-xs text-ink-soft">{VISIBILITY_HINT[v]}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-ink-soft">
          <input type="checkbox" name="applyToPast" className="accent-[var(--color-accent)]" /> Also apply to every day you&apos;ve already logged
        </label>
      </fieldset>
      <label className="flex gap-2.5">
        <input type="checkbox" name="hideTrackEnds" defaultChecked={hideTrackEnds} className="mt-0.5 accent-[var(--color-accent)]" />
        <span>
          <span className="block font-medium">Hide where your tracks start and end</span>
          <span className="block text-xs text-ink-soft">Other people don&apos;t see the first and last 400 m of your days on maps and replays, so where you started recording (home, a hotel, the car) stays private. You always see the whole track.</span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state.saved && <span className="text-good">Saved.</span>}
        {state.error && <span className="text-bad">{state.error}</span>}
      </div>
    </form>
  );
}

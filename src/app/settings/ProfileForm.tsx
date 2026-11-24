"use client";

import { useActionState, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { AVATAR_COLORS } from "@/lib/avatars";
import { type ProfileState, updateProfile } from "../actions";

export function ProfileForm({ user }: { user: { username: string; displayName: string; color: string } }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const [name, setName] = useState(user.displayName);
  const [color, setColor] = useState(user.color);

  return (
    <form action={action} className="card space-y-5 p-5">
      <div className="flex items-center gap-4">
        <Avatar user={{ displayName: name || user.username, color }} size={56} />
        <div className="flex-1 space-y-2">
          <label className="block">
            <span className="label mb-1 block">Display name</span>
            <input name="displayName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className="input" />
          </label>
        </div>
      </div>
      <label className="block">
        <span className="label mb-1 block">Username</span>
        <input name="username" required defaultValue={user.username} placeholder="username" autoComplete="username" className="input" />
      </label>
      <fieldset>
        <legend className="label mb-2">Accent</legend>
        <div className="flex gap-2">
          {Object.entries(AVATAR_COLORS).map(([key, hex]) => (
            <label key={key} className={`h-7 w-7 cursor-pointer rounded-full ring-2 ring-offset-2 ring-offset-surface transition ${color === key ? "ring-ink" : "ring-transparent"}`} style={{ background: hex }}>
              <input type="radio" name="color" value={key} checked={color === key} onChange={() => setColor(key)} className="sr-only" aria-label={key} />
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state.saved && <p className="rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-sm text-good">Saved</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

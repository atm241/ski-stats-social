"use client";

import { useActionState, useState } from "react";
import { type ProfileState, updateProfile } from "../actions";
import { AVATAR_COLORS, AVATAR_EMOJI } from "@/lib/avatars";

export function ProfileForm({ user }: { user: { username: string; displayName: string; avatar: string; color: string } }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const [avatar, setAvatar] = useState(user.avatar);
  const [color, setColor] = useState(user.color);

  return (
    <form action={action} className="card space-y-5 p-6">
      <div className="flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-4xl ring-4 ring-white" style={{ background: AVATAR_COLORS[color] }} aria-hidden>
          {avatar}
        </span>
        <div className="flex-1 space-y-2">
          <label className="block">
            <span className="sr-only">Username</span>
            <input name="username" required defaultValue={user.username} placeholder="username" autoComplete="username" className="input" />
          </label>
          <label className="block">
            <span className="sr-only">Display name</span>
            <input name="displayName" defaultValue={user.displayName} placeholder="Display name" className="input" />
          </label>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-bold text-ink-soft">Spirit animal</legend>
        <div className="flex flex-wrap gap-2">
          {AVATAR_EMOJI.map((e) => (
            <label key={e} className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl text-2xl ring-2 transition ${avatar === e ? "bg-sky-soft ring-sky" : "ring-line hover:bg-snow"}`}>
              <input type="radio" name="avatar" value={e} checked={avatar === e} onChange={() => setAvatar(e)} className="sr-only" />
              {e}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-bold text-ink-soft">Color</legend>
        <div className="flex gap-2">
          {Object.entries(AVATAR_COLORS).map(([key, hex]) => (
            <label key={key} className={`h-9 w-9 cursor-pointer rounded-full ring-2 ring-offset-2 ${color === key ? "ring-ink" : "ring-transparent"}`} style={{ background: hex }}>
              <input type="radio" name="color" value={key} checked={color === key} onChange={() => setColor(key)} className="sr-only" aria-label={key} />
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && <p className="rounded-2xl bg-berry-soft px-4 py-2 text-sm font-semibold text-berry">{state.error}</p>}
      {state.saved && <p className="rounded-2xl bg-mint-soft px-4 py-2 text-sm font-semibold text-[#1d7d61]">Saved!</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

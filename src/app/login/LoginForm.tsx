"use client";

import { useActionState, useState } from "react";
import { signIn, type LoginState } from "../actions";
import { AVATAR_COLORS, AVATAR_EMOJI } from "@/lib/avatars";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const [avatar, setAvatar] = useState(AVATAR_EMOJI[0]);
  const [color, setColor] = useState("sky");

  return (
    <form action={action} className="card space-y-5 p-6">
      <div className="flex items-center gap-4">
        <span className="flex h-20 w-20 items-center justify-center rounded-full text-4xl ring-4 ring-white" style={{ background: AVATAR_COLORS[color] }} aria-hidden>
          {avatar}
        </span>
        <div className="flex-1 space-y-2">
          <input name="username" required placeholder="username" autoComplete="username" className="input" />
          <input name="displayName" placeholder="Display name (optional)" className="input" />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-bold text-ink-soft">Pick your spirit animal</legend>
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
        <legend className="mb-2 text-sm font-bold text-ink-soft">And a color</legend>
        <div className="flex gap-2">
          {Object.entries(AVATAR_COLORS).map(([key, hex]) => (
            <label key={key} className={`h-9 w-9 cursor-pointer rounded-full ring-2 ring-offset-2 ${color === key ? "ring-ink" : "ring-transparent"}`} style={{ background: hex }}>
              <input type="radio" name="color" value={key} checked={color === key} onChange={() => setColor(key)} className="sr-only" aria-label={key} />
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && <p className="rounded-2xl bg-berry-soft px-4 py-2 text-sm font-semibold text-berry">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Strapping in…" : "Let's ski"}
      </button>
      <p className="text-center text-xs text-ink-soft">Dev mode: no password yet. Entering an existing username signs you in as them.</p>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { requestLink, type LinkState } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LinkState, FormData>(requestLink, {});

  if (state.sentTo) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <div className="text-5xl" aria-hidden>
          📬
        </div>
        <h2 className="font-display text-xl font-semibold">Check your email</h2>
        <p className="text-ink-soft">
          We sent a sign-in link to <strong className="text-ink">{state.sentTo}</strong>. It works once and expires in 15 minutes.
        </p>
        {state.devLink && (
          <div className="rounded-2xl bg-sun-soft p-3 text-left text-sm">
            <p className="mb-1 font-bold text-[#7a5500]">Dev mode: no email provider configured</p>
            <a href={state.devLink} className="font-semibold break-all text-sky-deep underline">
              Open the sign-in link
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-6">
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-ink-soft">Email</span>
        <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="input" />
      </label>
      {state.error && <p className="rounded-2xl bg-berry-soft px-4 py-2 text-sm font-semibold text-berry">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="text-center text-xs text-ink-soft">No password needed. New here? The same link creates your account.</p>
    </form>
  );
}

"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";
import { requestLink, type LinkState } from "../actions";

/** `next`: where to land after signing in (carried through the emailed link). */
export function LoginForm({ next }: { next?: string | null }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(requestLink, {});

  if (state.sentTo) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <MailCheck size={28} className="mx-auto text-accent" aria-hidden />
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-ink-soft">
          We sent a sign-in link to <span className="text-ink">{state.sentTo}</span>. It works once and expires in 15 minutes.
        </p>
        {state.devLink && (
          <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-left text-sm">
            <p className="mb-1 text-warn">Dev mode: no email provider configured</p>
            <a href={state.devLink} className="break-all text-accent underline">
              Open the sign-in link
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-5">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block">
        <span className="label mb-1.5 block">Email</span>
        <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="input" />
      </label>
      {state.error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}

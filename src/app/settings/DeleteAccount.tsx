"use client";

import { useActionState, useState } from "react";
import { type DeleteAccountState, deleteAccount } from "../actions";

/** Two steps: open the panel, then type your username. Nothing is deleted until the second submit. */
export function DeleteAccount({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, {});

  if (!open)
    return (
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5 text-sm">
        <p className="max-w-xl text-ink-soft">Permanently delete your profile, every ski day and GPS track, your follows and your sync tokens. This can&apos;t be undone.</p>
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-bad">
          Delete my account
        </button>
      </div>
    );

  return (
    <form action={action} className="card space-y-4 border-bad/40 p-5 text-sm">
      <p>
        This deletes <span className="font-medium">@{username}</span> and everything in it right away. Friends will no longer see your days or that you skied with them.
      </p>
      <label className="block">
        <span className="label mb-1 block">Type {username} to confirm</span>
        <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} className="input" />
      </label>
      {state.error && <p className="text-bad">{state.error}</p>}
      <div className="flex gap-2">
        <button disabled={pending || typed.trim().toLowerCase() !== username} className="rounded-lg bg-bad px-4 py-2 font-medium text-bg disabled:opacity-40">
          {pending ? "Deleting…" : "Delete forever"}
        </button>
        <button type="button" onClick={() => (setOpen(false), setTyped(""))} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

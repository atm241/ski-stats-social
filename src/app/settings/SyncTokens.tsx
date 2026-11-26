"use client";

import { Smartphone } from "lucide-react";
import { useActionState } from "react";
import { createSyncToken, revokeSyncToken, type TokenState } from "../actions";
import { CopyButton } from "./CopyButton";

export function SyncTokens({ tokens }: { tokens: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[] }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(createSyncToken, {});
  return (
    <div className="card space-y-4 p-5 text-sm">
      <p className="text-ink-soft">
        The Gapr app for iPhone signs in with your email and syncs your Apple Watch ski and snowboard workouts on its own. Each signed-in phone is listed here; revoke one to sign it out.
      </p>
      {state.secret ? (
        <div className="space-y-2 rounded-lg border border-good/30 bg-good/10 p-3">
          <div className="text-good">New token. Copy it now; it won&apos;t be shown again.</div>
          <div className="flex items-center gap-2">
            <code className="num min-w-0 flex-1 truncate rounded-lg border border-line bg-raised px-3 py-2 text-[12px] select-all">{state.secret}</code>
            <CopyButton text={state.secret} />
          </div>
        </div>
      ) : (
        <details className="text-ink-soft">
          <summary className="cursor-pointer hover:text-ink">API token for your own scripts</summary>
          <p className="mt-2 text-xs text-ink-faint">
            Send it as <code>Authorization: Bearer pp_…</code>, e.g. to <code>POST /api/uploads</code>. It&apos;s shown once.
          </p>
          <form action={action} className="mt-2 flex gap-2">
            <input name="name" defaultValue="Script" maxLength={60} className="input" aria-label="Token name" />
            <button className="btn-ghost shrink-0" disabled={pending}>
              Create token
            </button>
          </form>
        </details>
      )}
      {tokens.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <Smartphone size={14} className="shrink-0 text-ink-faint" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate">{t.name}</div>
                <div className="text-xs text-ink-faint">{t.lastUsedAt ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Never used"}</div>
              </div>
              <form action={revokeSyncToken.bind(null, t.id)}>
                <button className="text-xs text-ink-faint hover:text-bad">Revoke</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

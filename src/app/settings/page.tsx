import { Mail, Upload as UploadIcon } from "lucide-react";
import Link from "next/link";
import { SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inboundDomain } from "@/lib/inbound";
import { regenerateUploadAddress, setGlobalBoard, signOut } from "../actions";
import { CopyButton } from "./CopyButton";
import { ProfileForm } from "./ProfileForm";
import { SyncTokens } from "./SyncTokens";

const STATUS: Record<string, { label: string; className: string }> = {
  imported: { label: "Imported", className: "text-good border-good/30 bg-good/10" },
  duplicate: { label: "Duplicate", className: "text-accent border-accent/30 bg-accent/10" },
  skipped: { label: "Skipped", className: "text-warn border-warn/30 bg-warn/10" },
  error: { label: "Failed", className: "text-bad border-bad/30 bg-bad/10" },
};

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const me = await requireUser();
  const { welcome } = await searchParams;
  const [uploads, tokens] = await Promise.all([
    prisma.upload.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.apiToken.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const address = me.uploadToken ? `${me.uploadToken}@${inboundDomain()}` : null;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{welcome ? "Welcome" : "Settings"}</h1>
        {welcome && <p className="mt-1 text-ink-soft">Pick a username, then grab your upload address below.</p>}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <SectionTitle right={me.email ?? "demo account"}>Profile</SectionTitle>
          <ProfileForm user={me} />
        </section>

        <section>
          <SectionTitle>Email in your days</SectionTitle>
          <div className="card space-y-4 p-5 text-sm">
            <p className="text-ink-soft">Send a GPX file to your private address and it lands on your profile. You&apos;ll get a receipt by email.</p>
            {address ? (
              <div className="flex items-center gap-2">
                <code className="num min-w-0 flex-1 truncate rounded-lg border border-line bg-raised px-3 py-2.5 text-[13px] select-all">{address}</code>
                <CopyButton text={address} />
              </div>
            ) : (
              <form action={regenerateUploadAddress}>
                <button className="btn-primary">Create my upload address</button>
              </form>
            )}
            <ol className="list-decimal space-y-1.5 pl-5 text-ink-soft marker:text-ink-faint">
              <li>
                <span className="text-ink">Slopes:</span> open a day → ••• → Export As → GPX → Mail.
              </li>
              <li>
                <span className="text-ink">Garmin Connect:</span> activity → settings → Export to GPX, then email the file.
              </li>
              <li>Save the address as a contact so it&apos;s two taps from any share sheet.</li>
            </ol>
            {address && (
              <form action={regenerateUploadAddress} className="border-t border-line pt-3">
                <button className="text-xs text-ink-faint hover:text-bad">Get a new address (the old one stops working)</button>
              </form>
            )}
          </div>
        </section>
      </div>

      <section id="leaderboards">
        <SectionTitle>Leaderboards</SectionTitle>
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5 text-sm">
          <div className="max-w-xl">
            <div className="font-medium">{me.globalBoard ? "You're on the public leaderboard" : "You're on friends boards only"}</div>
            <p className="mt-1 text-ink-soft">
              Friends (people you follow who follow you back) always see your stats. The public board ranks everyone who joins it by vertical, days, resorts, best day and uphill. Top speed is never ranked publicly.
            </p>
          </div>
          <form action={setGlobalBoard.bind(null, !me.globalBoard)}>
            <button className={me.globalBoard ? "btn-ghost" : "btn-primary"}>{me.globalBoard ? "Leave the public board" : "Join the public board"}</button>
          </form>
        </div>
      </section>

      <section>
        <SectionTitle>iPhone sync</SectionTitle>
        <SyncTokens tokens={tokens.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))} />
      </section>

      <section>
        <SectionTitle
          right={
            <Link href="/upload" className="hover:text-ink">
              Upload files →
            </Link>
          }
        >
          Recent imports
        </SectionTitle>
        {uploads.length === 0 ? (
          <p className="card p-6 text-center text-sm text-ink-soft">Nothing yet. Upload a file or email one in.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {uploads.map((u) => {
              const st = STATUS[u.status] ?? STATUS.error;
              const dayIds = JSON.parse(u.dayIds) as string[];
              const Icon = u.source === "email" ? Mail : UploadIcon;
              return (
                <li key={u.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className={`mt-0.5 rounded-md border px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate">
                      <Icon size={13} className="shrink-0 text-ink-faint" aria-hidden />
                      <span className="truncate">{u.fileName}</span>
                    </div>
                    <div className="text-ink-soft">{u.message}</div>
                    {dayIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-3">
                        {dayIds.map((id, i) => (
                          <Link key={id} href={`/days/${id}`} className="text-accent hover:underline">
                            View day {dayIds.length > 1 ? i + 1 : ""} →
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <time className="num text-xs text-ink-faint" dateTime={u.createdAt.toISOString()}>
                    {u.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form action={signOut}>
        <button className="btn-ghost">Sign out</button>
      </form>
    </div>
  );
}

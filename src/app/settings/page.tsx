import Link from "next/link";
import { regenerateUploadAddress, signOut } from "../actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inboundDomain } from "@/lib/inbound";
import { CopyButton } from "./CopyButton";
import { ProfileForm } from "./ProfileForm";

const STATUS: Record<string, { label: string; className: string }> = {
  imported: { label: "Imported", className: "bg-mint-soft text-[#1d7d61]" },
  duplicate: { label: "Already had it", className: "bg-sky-soft text-sky-deep" },
  skipped: { label: "Skipped", className: "bg-sun-soft text-[#7a5500]" },
  error: { label: "Failed", className: "bg-berry-soft text-berry" },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const me = await requireUser();
  const { welcome } = await searchParams;
  const uploads = await prisma.upload.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 25 });
  const address = me.uploadToken ? `${me.uploadToken}@${inboundDomain()}` : null;

  return (
    <div className="space-y-8 pt-2">
      {welcome ? (
        <div className="rounded-3xl bg-sky-soft p-5">
          <h1 className="font-display text-3xl font-bold">Welcome aboard! ❄️</h1>
          <p className="text-ink-soft">Pick a username and avatar, then grab your upload address below.</p>
        </div>
      ) : (
        <h1 className="font-display text-3xl font-bold">Settings</h1>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-display text-xl font-semibold">Profile</h2>
          <ProfileForm user={me} />
          <p className="px-1 text-sm text-ink-soft">Signed in as {me.email ?? "a demo account"}.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl font-semibold">Email in your ski days</h2>
          <div className="card space-y-4 p-6">
            <p className="text-sm text-ink-soft">Send a GPX file to your private address and it lands on your profile. You&apos;ll get an email back with what was imported.</p>
            {address ? (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-2xl bg-snow px-4 py-2.5 font-mono text-sm ring-1 ring-line select-all">{address}</code>
                <CopyButton text={address} />
              </div>
            ) : (
              <form action={regenerateUploadAddress}>
                <button className="btn-primary">Create my upload address</button>
              </form>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>
                <strong>Slopes:</strong> open a day → ••• → Export As → GPX → Mail → send to your address.
              </li>
              <li>
                <strong>Garmin Connect:</strong> open the activity → ⚙️ → Export to GPX, then email the file.
              </li>
              <li>
                <strong>Tip:</strong> save the address as a contact (e.g. &ldquo;Ski uploads&rdquo;) so it&apos;s two taps from any share sheet.
              </li>
            </ol>
            {address && (
              <form action={regenerateUploadAddress} className="border-t border-line pt-3">
                <button className="text-xs font-semibold text-ink-soft hover:text-berry">Get a new address (the old one stops working)</button>
              </form>
            )}
          </div>
        </section>
      </div>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold">Recent imports</h2>
          <Link href="/upload" className="text-sm font-bold text-sky-deep hover:underline">
            Upload files →
          </Link>
        </div>
        {uploads.length === 0 ? (
          <p className="card p-6 text-center text-ink-soft">Nothing yet. Upload a file or email one in.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {uploads.map((u) => {
              const st = STATUS[u.status] ?? STATUS.error;
              const dayIds = JSON.parse(u.dayIds) as string[];
              return (
                <li key={u.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className={`chip mt-0.5 ${st.className}`}>{st.label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">
                      {u.fileName} <span className="font-normal text-ink-soft">· {u.source === "email" ? "✉️ email" : "⬆️ upload"}</span>
                    </div>
                    <div className="text-ink-soft">{u.message}</div>
                    {dayIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {dayIds.map((id, i) => (
                          <Link key={id} href={`/days/${id}`} className="font-semibold text-sky-deep hover:underline">
                            View day {dayIds.length > 1 ? i + 1 : ""} →
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <time className="text-xs text-ink-soft" dateTime={u.createdAt.toISOString()}>
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

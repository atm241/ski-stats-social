import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { currentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { devSignIn } from "../actions";
import { LoginForm } from "./LoginForm";
import { safeNext } from "@/lib/nextPath";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string; deleted?: string; next?: string }> }) {
  const sp = await searchParams;
  const { expired, deleted } = sp;
  const next = safeNext(sp.next);
  if (await currentUser()) redirect(next ?? "/");
  const demoUsers = process.env.NODE_ENV === "production" ? [] : await prisma.user.findMany({ where: { email: null }, orderBy: { displayName: "asc" } });

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-10">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to {APP_NAME}</h1>
        <p className="mt-2 text-sm text-ink-soft">We&apos;ll email you a link. No password needed; new accounts are created automatically.</p>
      </div>
      {deleted && <p className="rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink-soft">Your account and all your days were deleted.</p>}
      {expired && <p className="rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">That link expired or was already used. Request a new one.</p>}
      <LoginForm next={next} />

      {demoUsers.length > 0 && (
        <section className="rounded-xl border border-dashed border-line-strong p-4">
          <h2 className="label mb-3">Dev only · demo skiers</h2>
          <div className="flex flex-wrap gap-2">
            {demoUsers.map((u) => (
              <form key={u.id} action={devSignIn.bind(null, u.username, next)}>
                <button className="flex items-center gap-2 rounded-lg border border-line bg-raised py-1 pr-3 pl-1 text-sm hover:border-line-strong">
                  <Avatar user={u} size={24} /> {u.displayName}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

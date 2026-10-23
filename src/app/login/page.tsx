import { redirect } from "next/navigation";
import { devSignIn } from "../actions";
import { Avatar } from "@/components/Avatar";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await currentUser()) redirect("/");
  const { expired } = await searchParams;
  const demoUsers = process.env.NODE_ENV === "production" ? [] : await prisma.user.findMany({ where: { email: null }, orderBy: { displayName: "asc" } });

  return (
    <div className="mx-auto max-w-md space-y-6 pt-6">
      <div>
        <h1 className="mb-1 font-display text-3xl font-bold">Sign in or join</h1>
        <p className="text-ink-soft">We&apos;ll email you a link. Your account also gets its own address for emailing in ski days.</p>
      </div>
      {expired && <p className="rounded-2xl bg-berry-soft px-4 py-3 text-sm font-semibold text-berry">That link expired or was already used. Request a new one.</p>}
      <LoginForm />

      {demoUsers.length > 0 && (
        <section className="rounded-3xl border border-dashed border-[#c6d6f0] p-4">
          <h2 className="mb-2 text-sm font-bold text-ink-soft">Dev only: sign in as a demo skier</h2>
          <div className="flex flex-wrap gap-2">
            {demoUsers.map((u) => (
              <form key={u.id} action={devSignIn.bind(null, u.username)}>
                <button className="flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-sm font-semibold ring-1 ring-line hover:bg-sky-soft">
                  <Avatar user={u} size={28} /> {u.displayName}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

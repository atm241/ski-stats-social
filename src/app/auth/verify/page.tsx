import Link from "next/link";
import { verifyLogin } from "@/app/actions";
import { APP_NAME } from "@/lib/brand";

/**
 * Landing page for sign-in links. Redeeming happens on a button POST rather than on page load,
 * because email security scanners pre-fetch links and would otherwise use up the token.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-md pt-10">
      <div className="card space-y-4 p-6 text-center">
        <div className="text-5xl" aria-hidden>
          🎿
        </div>
        {token ? (
          <form action={verifyLogin} className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Sign in to {APP_NAME}</h1>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="btn-primary w-full">
              Continue
            </button>
          </form>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold">Link is missing its token</h1>
            <Link href="/login" className="btn-ghost">
              Get a new link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

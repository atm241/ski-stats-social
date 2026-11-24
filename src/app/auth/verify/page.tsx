import Link from "next/link";
import { verifyLogin } from "@/app/actions";
import { Logo } from "@/components/Art";
import { APP_NAME } from "@/lib/brand";

/**
 * Landing page for sign-in links. Redeeming happens on a button POST rather than on page load,
 * because email security scanners pre-fetch links and would otherwise use up the token.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-sm pt-14">
      <div className="card space-y-5 p-6 text-center">
        <Logo className="mx-auto h-10 w-10" />
        {token ? (
          <form action={verifyLogin} className="space-y-4">
            <h1 className="text-xl font-semibold tracking-tight">Sign in to {APP_NAME}</h1>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="btn-primary w-full">
              Continue
            </button>
          </form>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">This link is missing its token</h1>
            <Link href="/login" className="btn-ghost">
              Get a new link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

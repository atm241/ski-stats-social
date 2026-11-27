import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { acceptInvite } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { currentUser } from "@/lib/auth";
import { inviterFor } from "@/lib/people";
import { friendIds } from "@/lib/social";

export const metadata = { title: "Ski with me" };

/** Landing page for someone's invite link. Accepting makes you friends (you follow each other). */
export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [inviter, me] = await Promise.all([inviterFor(code), currentUser()]);
  if (!inviter) notFound();
  if (me?.id === inviter.id) redirect("/people");
  const already = me ? (await friendIds(me.id)).includes(inviter.id) : false;

  return (
    <div className="mx-auto max-w-sm pt-14">
      <div className="card space-y-5 p-6 text-center">
        <div className="flex justify-center">
          <Avatar user={inviter} size={64} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{inviter.displayName} wants to ski with you</h1>
          <p className="mt-1 text-sm text-ink-soft">Friends see each other&apos;s days, compare on the friends board, and show up in &ldquo;skied with.&rdquo;</p>
        </div>
        {!me ? (
          <>
            <Link href={`/login?next=${encodeURIComponent(`/invite/${code}`)}`} className="btn-primary w-full">
              Sign in to add {inviter.displayName.split(" ")[0]}
            </Link>
            <p className="text-xs text-ink-faint">New here? Signing in creates your account, then brings you back to this invite.</p>
          </>
        ) : already ? (
          <Link href={`/u/${inviter.username}`} className="btn-ghost w-full">
            You&apos;re already friends. See their days
          </Link>
        ) : (
          <form action={acceptInvite.bind(null, code)}>
            <button className="btn-primary w-full">Add {inviter.displayName.split(" ")[0]} as a friend</button>
          </form>
        )}
      </div>
    </div>
  );
}

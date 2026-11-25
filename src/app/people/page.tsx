import { Search } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/app/settings/CopyButton";
import { Avatar } from "@/components/Avatar";
import { FollowButton } from "@/components/FollowButton";
import { SectionTitle } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { appUrl } from "@/lib/magicLink";
import { inviteCodeFor, searchPeople, suggestions } from "@/lib/people";
import { followingIds, friendIds } from "@/lib/social";

export const metadata = { title: "Find friends" };

/** Search skiers, see who you may know, and share your invite link. */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const me = await currentUser();
  const [results, suggested, following, friends, code] = await Promise.all([
    searchPeople(q, me),
    me ? suggestions(me) : Promise.resolve([]),
    me ? followingIds(me.id) : Promise.resolve([]),
    me ? friendIds(me.id) : Promise.resolve([]),
    me ? inviteCodeFor(me.id) : Promise.resolve(null),
  ]);
  const followingSet = new Set(following);
  const friendSet = new Set(friends);
  const row = (u: { id: string; username: string; displayName: string; color: string }, note?: string) => (
    <li key={u.id} className="flex items-center gap-3 px-4 py-3">
      <Link href={`/u/${u.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar user={u} size={34} />
        <div className="min-w-0">
          <div className="truncate font-medium">{u.displayName}</div>
          <div className="truncate text-xs text-ink-soft">
            @{u.username}
            {friendSet.has(u.id) ? " · friend" : note ? ` · ${note}` : ""}
          </div>
        </div>
      </Link>
      {me && <FollowButton username={u.username} following={followingSet.has(u.id)} />}
    </li>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Find friends</h1>
        <p className="mt-1 text-sm text-ink-soft">Friends are people you follow who follow you back: they see you on their friends board, in &ldquo;skied with,&rdquo; and in their feed.</p>
      </div>

      <form className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input name="q" defaultValue={q} placeholder="Search by name or @username" autoComplete="off" className="input pl-10" aria-label="Search skiers" />
      </form>

      {q.trim().length >= 2 && (
        <section>
          <SectionTitle right={<span className="num">{results.length}</span>}>Results</SectionTitle>
          {results.length ? <ul className="card divide-y divide-line overflow-hidden">{results.map((u) => row(u))}</ul> : <p className="text-sm text-ink-soft">Nobody by that name yet. Send them your invite link.</p>}
        </section>
      )}

      {me && code && (
        <section>
          <SectionTitle>Your invite link</SectionTitle>
          <div className="card space-y-3 p-5 text-sm">
            <p className="text-ink-soft">Anyone who opens it and signs in can add you as a friend in one tap.</p>
            <div className="flex items-center gap-2">
              <code className="num min-w-0 flex-1 truncate rounded-lg border border-line bg-raised px-3 py-2.5 text-[13px] select-all">{`${appUrl()}/invite/${code}`}</code>
              <CopyButton text={`${appUrl()}/invite/${code}`} />
            </div>
          </div>
        </section>
      )}

      {suggested.length > 0 && (
        <section>
          <SectionTitle>People you may know</SectionTitle>
          <ul className="card divide-y divide-line overflow-hidden">{suggested.map((s) => row(s.user, s.reason))}</ul>
        </section>
      )}

      {!me && (
        <p className="text-sm text-ink-soft">
          <Link href="/login" className="text-accent hover:text-accent-strong">
            Sign in
          </Link>{" "}
          to follow people and get your invite link.
        </p>
      )}
    </div>
  );
}

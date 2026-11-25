import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <div className="label">404</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Off the map</h1>
      <p className="mt-2 text-ink-soft">That page, skier or day doesn&apos;t exist, or it was deleted.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="btn-primary">
          Home
        </Link>
        <Link href="/leaderboard" className="btn-ghost">
          Leaderboard
        </Link>
      </div>
    </div>
  );
}

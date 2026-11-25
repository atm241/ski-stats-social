"use client"; // error boundaries must be client components

import Link from "next/link";
import { useEffect } from "react";

/** Anything that throws while rendering a page lands here instead of the framework's blank error screen. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <div className="label">Something broke</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Yard sale</h1>
      <p className="mt-2 text-ink-soft">This page hit an error. Your days are safe; try again, or head back home.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={() => retry()} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-ghost">
          Home
        </Link>
      </div>
    </div>
  );
}

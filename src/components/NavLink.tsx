"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link href={href} className={`rounded-md px-2 py-1.5 sm:px-2.5 transition-colors ${active ? "bg-raised text-ink" : "text-ink-soft hover:text-ink"}`}>
      {children}
    </Link>
  );
}

import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Art";
import { NavLink } from "@/components/NavLink";
import { currentUser } from "@/lib/auth";
import { APP_NAME, APP_SHORT_NAME, TAGLINE } from "@/lib/brand";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = { title: { default: APP_NAME, template: `%s · ${APP_NAME}` }, description: TAGLINE };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable} antialiased`}>
        <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
            <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
              <Logo className="h-7 w-7" />
              <span className="hidden sm:inline" title={APP_NAME}>
                {APP_SHORT_NAME}
              </span>
            </Link>
            <nav className="flex items-center gap-0.5 text-[13px] sm:text-sm">
              {user && (
                <span className="hidden sm:inline">
                  <NavLink href="/">Feed</NavLink>
                </span>
              )}
              <NavLink href="/leaderboard">Leaderboard</NavLink>
              <NavLink href="/mountains">3D</NavLink>
              {user && (
                <span className="hidden sm:inline">
                  <NavLink href="/people">People</NavLink>
                </span>
              )}
              {user ? (
                <>
                  <NavLink href={`/u/${user.username}`}>Stats</NavLink>
                  <Link href="/upload" className="btn-primary ml-1.5 px-2.5! py-1.5! sm:ml-2 sm:px-3!" aria-label="Upload">
                    <Upload size={14} aria-hidden className="sm:hidden" />
                    <span className="hidden sm:inline">Upload</span>
                  </Link>
                  <Link href="/settings" className="ml-1.5 sm:ml-2" aria-label="Settings">
                    <Avatar user={user} size={30} />
                  </Link>
                </>
              ) : (
                <Link href="/login" className="btn-primary ml-2 px-3! py-1.5!">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-20">{children}</main>
        <footer className="mx-auto max-w-6xl border-t border-line px-4 py-6 text-xs text-ink-faint">
          Resort boundaries © <a className="underline hover:text-ink-soft" href="https://openskimap.org">OpenSkiMap</a> / OpenStreetMap contributors (ODbL).
        </footer>
      </body>
    </html>
  );
}

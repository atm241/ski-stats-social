import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Art";
import { currentUser } from "@/lib/auth";
import { APP_NAME, TAGLINE } from "@/lib/brand";
import "./globals.css";

const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], weight: ["500", "600", "700"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });

export const metadata: Metadata = { title: APP_NAME, description: TAGLINE };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body className={`${fredoka.variable} ${nunito.variable} antialiased`}>
        <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold">
            <Logo className="h-9 w-9" />
            <span className="hidden sm:inline">{APP_NAME}</span>
          </Link>
          <nav className="flex items-center gap-1 text-[15px] font-semibold text-ink-soft">
            <Link href="/leaderboard" className="rounded-full px-3 py-1.5 hover:bg-white hover:text-ink">
              Leaderboard
            </Link>
            {user ? (
              <>
                <Link href="/upload" className="rounded-full px-3 py-1.5 hover:bg-white hover:text-ink">
                  Upload
                </Link>
                <Link href={`/u/${user.username}`} className="ml-1" aria-label="Your profile">
                  <Avatar user={user} size={36} />
                </Link>
              </>
            ) : (
              <Link href="/login" className="btn-primary ml-1 px-4! py-1.5!">
                Join
              </Link>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-16">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-ink-soft">
          Resort boundaries © <a className="underline" href="https://openskimap.org">OpenSkiMap</a> / OpenStreetMap contributors (ODbL).
        </footer>
      </body>
    </html>
  );
}

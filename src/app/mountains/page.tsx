import { ArrowRight, Box } from "lucide-react";
import Link from "next/link";
import { listMountains } from "@/lib/mountain/registry";

export const metadata = { title: "3D mountains" };

export default async function MountainsPage() {
  const mountains = await listMountains();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">3D mountains</h1>
      <p className="mt-1 text-sm text-ink-soft">Low-poly models built from elevation data, OpenStreetMap trails, satellite forest maps and lidar cliffs. Days skied here get a 3D replay.</p>
      <ul className="card mt-6 divide-y divide-line overflow-hidden">
        {mountains.map((m) => (
          <li key={m.slug}>
            <Link href={`/mountains/${m.slug}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-raised">
              <Box size={18} className="text-accent" aria-hidden />
              <div className="flex-1">
                <div className="font-medium">{m.name}</div>
                {m.resorts.length > 1 && <div className="text-xs text-ink-soft">{m.resorts.join(" + ")}</div>}
              </div>
              <ArrowRight size={16} className="text-ink-faint transition-colors group-hover:text-ink" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

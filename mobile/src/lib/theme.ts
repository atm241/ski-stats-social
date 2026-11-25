/** Same tokens as the web app's globals.css, so both feel like one product. */
export const C = {
  bg: "#090b10",
  surface: "#10141b",
  raised: "#171c25",
  hover: "#1d2330",
  line: "#222936",
  lineStrong: "#2e3646",
  ink: "#e8edf5",
  inkSoft: "#8b95a8",
  inkFaint: "#5d6678",
  accent: "#5cc8ff",
  vert: "#5cc8ff",
  lift: "#a78bfa",
  uphill: "#fbbf24",
  good: "#34d399",
  bad: "#f87171",
} as const;

export const DIFFICULTY_COLOR: Record<string, string> = {
  novice: "#34d399",
  easy: "#34d399",
  intermediate: "#3b82f6",
  advanced: "#e5e7eb",
  expert: "#9ca3af",
  freeride: "#fb923c",
  extreme: "#fb923c",
};

/** "2025-26" → "2025/26" */
export const seasonLabel = (key: string) => key.replace("-", "/");

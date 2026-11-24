/** Accent colours for monogram avatars; keys are stored on User.color. */
export const AVATAR_COLORS: Record<string, string> = {
  sky: "#5cc8ff",
  berry: "#f472b6",
  mint: "#34d399",
  sun: "#fbbf24",
  lilac: "#a78bfa",
  peach: "#fb923c",
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Legacy: User.avatar still stores one of these (the UI now shows monograms). */
export const AVATAR_EMOJI = ["⛷️", "🏂", "🐧", "🦊", "🐻‍❄️", "🐐", "🦉", "🐰", "🐱", "🦭", "🏔️", "❄️"];

import { AVATAR_COLORS, initials } from "@/lib/avatars";

/** Monogram avatar: initials on a tinted disc in the user's colour. */
export function Avatar({ user, size = 40 }: { user: { color: string; displayName: string }; size?: number }) {
  const c = AVATAR_COLORS[user.color] ?? AVATAR_COLORS.sky;
  return (
    <span
      role="img"
      aria-label={user.displayName}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight"
      style={{ width: size, height: size, fontSize: size * 0.38, color: c, background: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}55` }}
    >
      {initials(user.displayName)}
    </span>
  );
}

import { AVATAR_COLORS } from "@/lib/avatars";

export function Avatar({ user, size = 40 }: { user: { avatar: string; color: string; displayName: string }; size?: number }) {
  return (
    <span
      role="img"
      aria-label={user.displayName}
      className="inline-flex shrink-0 items-center justify-center rounded-full ring-2 ring-white"
      style={{ width: size, height: size, background: AVATAR_COLORS[user.color] ?? AVATAR_COLORS.sky, fontSize: size * 0.55 }}
    >
      {user.avatar}
    </span>
  );
}

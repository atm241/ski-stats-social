import { router } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiDaySummary, ApiUser } from "@shared/apiTypes";
import { AVATAR_COLORS, initials } from "@shared/avatars";
import { feet, mph } from "@shared/format";
import { C } from "@/lib/theme";

export function Avatar({ user, size = 32 }: { user: Pick<ApiUser, "displayName" | "color">; size?: number }) {
  const color = AVATAR_COLORS[user.color] ?? C.accent;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}26`, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${color}40` }}>
      <Text style={{ color, fontSize: size * 0.36, fontWeight: "600" }}>{initials(user.displayName)}</Text>
    </View>
  );
}

const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** One ski day in a list: date, who, where, runs, top speed, vertical. Tapping opens the day. */
export function DayRow({ day, showUser = true }: { day: ApiDaySummary; showUser?: boolean }) {
  const [, m, d] = day.localDate.split("-");
  return (
    <Pressable onPress={() => router.push({ pathname: "/day/[id]", params: { id: day.id } })} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.raised }]}>
        <View style={{ width: 34, alignItems: "center" }}>
          <Text style={s.month}>{MONTH[Number(m) - 1]}</Text>
          <Text style={s.date}>{Number(d)}</Text>
        </View>
        {showUser && <Avatar user={day.user} size={30} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>
            {day.resortName ?? "Backcountry"}
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            {showUser ? `${day.user.displayName} · ` : ""}
            {day.runCount} {day.runCount === 1 ? "run" : "runs"} · {mph(day.maxSpeedMps)} mph{day.flagged ? " · flagged" : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.vert}>{feet(day.verticalM)}</Text>
          <Text style={s.unit}>ft</Text>
        </View>
    </Pressable>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>
        {value}
        {unit ? <Text style={s.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, paddingHorizontal: 16 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Loading({ error }: { error?: string | null }) {
  return <View style={s.center}>{error ? <Text style={{ color: C.bad }}>{error}</Text> : <ActivityIndicator color={C.accent} />}</View>;
}

export function Button({ title, onPress, kind = "primary", disabled }: { title: string; onPress: () => void; kind?: "primary" | "ghost"; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, kind === "primary" ? s.btnPrimary : s.btnGhost, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={[s.btnText, { color: kind === "primary" ? C.bg : C.ink }]}>{title}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg, padding: 24 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  month: { color: C.inkFaint, fontSize: 10, letterSpacing: 1 },
  date: { color: C.ink, fontSize: 18, fontWeight: "600", fontVariant: ["tabular-nums"] },
  title: { color: C.ink, fontSize: 15, fontWeight: "500" },
  sub: { color: C.inkSoft, fontSize: 12, marginTop: 2 },
  vert: { color: C.vert, fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"] },
  unit: { color: C.inkFaint, fontSize: 10 },
  stat: { flexBasis: "30%", flexGrow: 1, paddingVertical: 10 },
  statLabel: { color: C.inkFaint, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
  statValue: { color: C.ink, fontSize: 20, fontWeight: "600", marginTop: 4, fontVariant: ["tabular-nums"] },
  statUnit: { color: C.inkSoft, fontSize: 12, fontWeight: "400" },
  sectionTitle: { color: C.ink, fontSize: 15, fontWeight: "600" },
  card: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line, marginHorizontal: 16, overflow: "hidden" },
  btn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center" },
  btnPrimary: { backgroundColor: C.accent },
  btnGhost: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.lineStrong },
  btnText: { fontSize: 15, fontWeight: "600" },
  input: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: C.ink, fontSize: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
});

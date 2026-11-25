/**
 * Shapes returned by the JSON API (/api/…), shared with the mobile app. No server imports here, so
 * the app can import this file directly. Units are metric like the database; format on display.
 */

export interface ApiUser {
  username: string;
  displayName: string;
  color: string;
}

export interface ApiDaySummary {
  id: string;
  user: ApiUser;
  localDate: string;
  resortName: string | null;
  kind: string;
  verticalM: number;
  uphillM: number;
  distanceM: number;
  maxSpeedMps: number;
  runCount: number;
  liftCount: number;
  flagged: boolean;
  /** the 3D mountain this day can replay on, if we have one */
  mountain: string | null;
}

export interface ApiFeed {
  me: ApiUser | null;
  days: ApiDaySummary[];
}

export interface ApiLeaderboard {
  season: string;
  seasons: string[];
  metric: string;
  scope: "public" | "friends";
  rows: { rank: number; user: ApiUser; verticalM: number; days: number; resorts: number; bestDayM: number; uphillM: number }[];
}

export interface ApiProfile {
  user: ApiUser;
  isMe: boolean;
  following: boolean;
  followers: number;
  followingCount: number;
  lifetime: { verticalM: number; days: number };
  season: { key: string; verticalM: number; days: number; resorts: number };
  days: ApiDaySummary[];
  completions: { slug: string; name: string; skied: number; total: number }[];
}

export interface ApiDayDetail extends ApiDaySummary {
  timezone: string;
  startedAt: number;
  endedAt: number;
  skiTimeS: number;
  liftTimeS: number;
  liftWaitS: number;
  longestRunM: number;
  peakEleM: number;
  /** runs and lifts in order, named from the trail map where we could */
  timeline: {
    kind: string;
    startT: number;
    endT: number;
    verticalM: number;
    maxSpeedMps: number;
    name: string | null;
    difficulty: string | null;
    /** named runs: likes, and the trail whose leaderboard to open */
    run?: { id: string; likes: number; liked: boolean; canLike: boolean; trail: string };
  }[];
  /** [secondsSinceStart, elevationM] for the altitude chart */
  profile: [number, number][];
  skiedWith: { user: ApiUser; dayId: string; runs: number; lifts: number }[];
  comments: ApiComment[];
  /** signed in, so can comment */
  canComment: boolean;
}

export interface ApiComment {
  id: string;
  user: ApiUser;
  body: string;
  createdAt: number;
  canDelete: boolean;
}

export interface ApiTrailBoard {
  mountain: string;
  trail: string;
  difficulty: string | null;
  totalRuns: number;
  fastest: { dayId: string; user: ApiUser; localDate: string; maxSpeedMps: number }[];
  liked: { dayId: string; user: ApiUser; localDate: string; likes: number }[];
}

export interface ApiPeople {
  results: (ApiUser & { following: boolean; friend: boolean })[];
  suggestions: (ApiUser & { following: boolean; reason: string })[];
  /** your invite link, when signed in */
  inviteUrl: string | null;
}

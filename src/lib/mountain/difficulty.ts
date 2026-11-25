/** Run difficulty: map colours, symbols and labels (OSM piste:difficulty values). */
export const DIFFICULTY: Record<string, { label: string; color: string; symbol: string }> = {
  novice: { label: "Beginner", color: "#3fbf6f", symbol: "●" },
  easy: { label: "Green", color: "#3fbf6f", symbol: "●" },
  intermediate: { label: "Blue", color: "#2f7fe0", symbol: "■" },
  advanced: { label: "Black", color: "#1f2b4d", symbol: "◆" },
  expert: { label: "Double black", color: "#1f2b4d", symbol: "◆◆" },
  freeride: { label: "Off-piste", color: "#e07b39", symbol: "▲" },
  extreme: { label: "Extreme", color: "#e07b39", symbol: "▲" },
  unknown: { label: "Unrated", color: "#8a96b3", symbol: "○" },
};
export const difficultyOf = (d: string | null) => (d && DIFFICULTY[d] ? d : "unknown");

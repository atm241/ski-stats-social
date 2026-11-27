/** Who can see a day. Dependency-free: the phone app imports it as `@shared/visibility`. */
export const VISIBILITIES = ["public", "friends", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABEL: Record<Visibility, string> = { public: "Everyone", friends: "Friends", private: "Only you" };
export const VISIBILITY_HINT: Record<Visibility, string> = {
  public: "Anyone, including people not signed in",
  friends: "People you follow who follow you back",
  private: "Still counts toward your totals and boards",
};

export const isVisibility = (v: unknown): v is Visibility => typeof v === "string" && (VISIBILITIES as readonly string[]).includes(v);

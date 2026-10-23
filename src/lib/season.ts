import tzlookup from "@photostructure/tz-lookup";

export function timezoneAt(lat: number, lon: number): string {
  try {
    return tzlookup(lat, lon);
  } catch {
    return "UTC";
  }
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** YYYY-MM-DD in the given IANA timezone. */
export function localDate(t: number, timeZone: string): string {
  let f = dateFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(timeZone, f);
  }
  return f.format(t);
}

/**
 * Seasons run July → June, labelled "2025-26". Southern hemisphere June days roll into the
 * upcoming season so an Andes or NZ winter isn't split across two seasons.
 */
export function seasonKey(date: string, lat: number): string {
  const [y, m] = date.split("-").map(Number);
  const startYear = m >= 7 || (lat < 0 && m >= 6) ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function currentSeasonKey(now = new Date()): string {
  return seasonKey(now.toISOString().slice(0, 10), 45);
}

export function seasonLabel(key: string): string {
  return key.replace("-", "/");
}

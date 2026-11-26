/**
 * GPX from phone location fixes (HealthKit workout routes), in the shape Apple's Health export uses
 * (`<extensions><speed>`, `<hAcc>`), so the parser reads device speed for accurate top speed.
 * Dependency-free: the phone app imports it as `@shared/gpx/fromLocations`.
 */
export interface RouteLocation {
  latitude: number;
  longitude: number;
  /** metres */
  altitude: number;
  /** m/s; negative when unknown */
  speed: number;
  /** degrees; negative when unknown */
  course: number;
  horizontalAccuracy: number;
  /** negative when the altitude is invalid */
  verticalAccuracy: number;
  date: Date;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function gpxFromLocations(name: string, locations: readonly RouteLocation[]): string {
  const pts = [...locations]
    .filter((l) => l.verticalAccuracy >= 0) // no altitude, no vertical: skip the fix
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((l) => {
      let ext = "";
      if (l.speed >= 0) ext += `<speed>${l.speed.toFixed(2)}</speed>`;
      if (l.course >= 0) ext += `<course>${l.course.toFixed(1)}</course>`;
      ext += `<hAcc>${l.horizontalAccuracy.toFixed(1)}</hAcc><vAcc>${l.verticalAccuracy.toFixed(1)}</vAcc>`;
      return `<trkpt lat="${l.latitude.toFixed(7)}" lon="${l.longitude.toFixed(7)}"><ele>${l.altitude.toFixed(2)}</ele><time>${l.date.toISOString()}</time><extensions>${ext}</extensions></trkpt>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Gapr" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${esc(name)}</name><trkseg>
${pts.join("\n")}
</trkseg></trk></gpx>
`;
}

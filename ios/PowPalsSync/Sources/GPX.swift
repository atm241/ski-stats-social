import CoreLocation
import Foundation

/// Builds a GPX document from workout route locations, in the same shape Apple's Health export uses
/// (`<extensions><speed>`, `<hAcc>`), so the server reads device speed for accurate top speed.
enum GPX {
    static func document(name: String, locations: [CLLocation]) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var out = """
        <?xml version="1.0" encoding="UTF-8"?>
        <gpx version="1.1" creator="Pow Pals iOS" xmlns="http://www.topografix.com/GPX/1/1">
        <trk><name>\(escape(name))</name><trkseg>

        """
        for loc in locations.sorted(by: { $0.timestamp < $1.timestamp }) {
            // Points without a valid altitude can't contribute to vertical; skip them.
            guard loc.verticalAccuracy >= 0 else { continue }
            let c = loc.coordinate
            out += "<trkpt lat=\"\(fmt(c.latitude, 7))\" lon=\"\(fmt(c.longitude, 7))\">"
            out += "<ele>\(fmt(loc.altitude, 2))</ele><time>\(iso.string(from: loc.timestamp))</time><extensions>"
            if loc.speed >= 0 { out += "<speed>\(fmt(loc.speed, 2))</speed>" }
            if loc.course >= 0 { out += "<course>\(fmt(loc.course, 1))</course>" }
            out += "<hAcc>\(fmt(loc.horizontalAccuracy, 1))</hAcc><vAcc>\(fmt(loc.verticalAccuracy, 1))</vAcc>"
            out += "</extensions></trkpt>\n"
        }
        out += "</trkseg></trk></gpx>\n"
        return out
    }

    private static func fmt(_ v: Double, _ digits: Int) -> String { String(format: "%.\(digits)f", v) }
    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
    }
}

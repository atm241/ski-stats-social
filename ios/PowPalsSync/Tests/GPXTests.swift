import CoreLocation
import XCTest
@testable import PowPalsSync

final class GPXTests: XCTestCase {
    func testWritesAppleStyleExtensionsAndSkipsBadAltitude() {
        let t0 = Date(timeIntervalSince1970: 1_771_000_000)
        let good = CLLocation(coordinate: .init(latitude: 40.6, longitude: -111.5), altitude: 2500.5, horizontalAccuracy: 4, verticalAccuracy: 3, course: 90, speed: 12.34, timestamp: t0)
        let noAlt = CLLocation(coordinate: .init(latitude: 40.6, longitude: -111.5), altitude: 0, horizontalAccuracy: 4, verticalAccuracy: -1, course: -1, speed: -1, timestamp: t0.addingTimeInterval(1))
        let later = CLLocation(coordinate: .init(latitude: 40.601, longitude: -111.501), altitude: 2490, horizontalAccuracy: 5, verticalAccuracy: 3, course: -1, speed: -1, timestamp: t0.addingTimeInterval(2))
        let gpx = GPX.document(name: "Day <1>", locations: [later, noAlt, good])

        XCTAssertTrue(gpx.contains("<name>Day &lt;1&gt;</name>"))
        XCTAssertEqual(gpx.components(separatedBy: "<trkpt").count - 1, 2, "point without altitude is dropped")
        XCTAssertTrue(gpx.contains("<speed>12.34</speed>"))
        XCTAssertTrue(gpx.contains("<hAcc>4.0</hAcc>"))
        XCTAssertLessThan(gpx.range(of: "2500.50")!.lowerBound, gpx.range(of: "2490.00")!.lowerBound, "sorted by time")
        XCTAssertFalse(gpx.components(separatedBy: "<trkpt").last!.contains("<speed>"), "unknown speed omitted")
    }
}

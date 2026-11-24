import SwiftUI

@main
struct PowPalsSyncApp: App {
    @State private var sync = HealthSync()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(sync)
                .preferredColorScheme(.dark)
                .task { sync.startBackgroundDelivery() }
        }
    }
}

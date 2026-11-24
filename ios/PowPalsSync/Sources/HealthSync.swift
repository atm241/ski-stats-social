import CoreLocation
import Foundation
import HealthKit
import Observation

/// Reads skiing / snowboarding workouts and their GPS routes from HealthKit and uploads new ones.
@MainActor
@Observable
final class HealthSync {
    static let skiTypes: [HKWorkoutActivityType] = [.downhillSkiing, .snowboarding, .snowSports, .crossCountrySkiing]

    struct Workout: Identifiable {
        let id: UUID
        let start: Date
        let end: Date
        let type: HKWorkoutActivityType
        var synced: Bool
    }

    private let store = HKHealthStore()
    private let defaults = UserDefaults.standard
    private var observer: HKObserverQuery?

    var workouts: [Workout] = []
    var status: String = ""
    var busy = false
    var lastSync: Date? { defaults.object(forKey: "lastSync") as? Date }

    var serverURL: String {
        get { defaults.string(forKey: "serverURL") ?? "http://localhost:3100" }
        set { defaults.set(newValue, forKey: "serverURL") }
    }
    var token: String? {
        get { Keychain.get("apiToken") }
        set { Keychain.set("apiToken", newValue) }
    }
    var connectedAs: String? {
        get { defaults.string(forKey: "connectedAs") }
        set { defaults.set(newValue, forKey: "connectedAs") }
    }

    private var syncedIDs: Set<String> {
        get { Set(defaults.stringArray(forKey: "syncedWorkouts") ?? []) }
        set { defaults.set(Array(newValue), forKey: "syncedWorkouts") }
    }

    var api: API? {
        guard let token, let url = URL(string: serverURL) else { return nil }
        return API(baseURL: url, token: token)
    }

    // MARK: - Connection

    func connect(serverURL: String, token: String) async {
        self.serverURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        self.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let me = try await api!.me()
            connectedAs = me.displayName
            status = "Connected as \(me.displayName)"
        } catch {
            connectedAs = nil
            status = error.localizedDescription
        }
    }

    func disconnect() {
        token = nil
        connectedAs = nil
        status = ""
    }

    // MARK: - HealthKit

    func requestAccess() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            status = "Health data isn't available on this device."
            return
        }
        do {
            try await store.requestAuthorization(toShare: [], read: [HKObjectType.workoutType(), HKSeriesType.workoutRoute()])
            await refresh()
            startBackgroundDelivery()
        } catch {
            status = "Health access failed: \(error.localizedDescription)"
        }
    }

    /// Recent ski workouts, newest first.
    func refresh() async {
        let types = NSCompoundPredicate(orPredicateWithSubpredicates: Self.skiTypes.map { HKQuery.predicateForWorkouts(with: $0) })
        let query = HKSampleQueryDescriptor(predicates: [.workout(types)], sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)], limit: 100)
        do {
            let found = try await query.result(for: store)
            let done = syncedIDs
            workouts = found.map { Workout(id: $0.uuid, start: $0.startDate, end: $0.endDate, type: $0.workoutActivityType, synced: done.contains($0.uuid.uuidString)) }
        } catch let error as HKError where error.code == .errorAuthorizationNotDetermined {
            workouts = [] // not asked yet: the "Allow access" button covers it
        } catch {
            status = "Couldn't read workouts: \(error.localizedDescription)"
        }
    }

    /// Uploads every ski workout that hasn't been sent yet (the server also skips duplicate days).
    func syncNow() async {
        guard let api else {
            status = "Connect your account first."
            return
        }
        busy = true
        defer { busy = false }
        await refresh()
        let pending = workouts.filter { !$0.synced }
        if pending.isEmpty {
            status = "Everything's synced."
            defaults.set(Date(), forKey: "lastSync")
            return
        }
        var imported = 0
        var batch: [(id: UUID, name: String, gpx: String)] = []
        func flush() async throws {
            guard !batch.isEmpty else { return }
            let res = try await api.upload(files: batch.map { ($0.name, $0.gpx) })
            imported += res.results.reduce(0) { $0 + $1.saved.count }
            var ids = syncedIDs
            for (item, result) in zip(batch, res.results) where result.error == nil { ids.insert(item.id.uuidString) }
            syncedIDs = ids
            batch.removeAll()
        }
        do {
            for (i, w) in pending.enumerated() {
                status = "Reading route \(i + 1) of \(pending.count)…"
                let locations = try await routeLocations(for: w.id)
                if locations.count < 10 {
                    var ids = syncedIDs // no GPS on this workout; don't retry forever
                    ids.insert(w.id.uuidString)
                    syncedIDs = ids
                    continue
                }
                let name = "route_\(w.start.formatted(.iso8601.year().month().day()))_\(w.id.uuidString.prefix(8)).gpx"
                batch.append((w.id, name, GPX.document(name: name, locations: locations)))
                if batch.count == 5 { try await flush() }
            }
            try await flush()
            defaults.set(Date(), forKey: "lastSync")
            status = imported == 0 ? "Up to date." : "Imported \(imported) new day\(imported == 1 ? "" : "s")."
        } catch {
            status = "Sync failed: \(error.localizedDescription)"
        }
        await refresh()
    }

    private func routeLocations(for workoutID: UUID) async throws -> [CLLocation] {
        let workoutQuery = HKSampleQueryDescriptor(predicates: [.workout(HKQuery.predicateForObject(with: workoutID))], sortDescriptors: [], limit: 1)
        guard let workout = try await workoutQuery.result(for: store).first else { return [] }
        let routeQuery = HKSampleQueryDescriptor(predicates: [.workoutRoute(HKQuery.predicateForObjects(from: workout))], sortDescriptors: [])
        var out: [CLLocation] = []
        for route in try await routeQuery.result(for: store) {
            for try await chunk in HKWorkoutRouteQueryDescriptor(route).results(for: store) {
                out.append(chunk)
            }
        }
        return out
    }

    // MARK: - Background

    /// Wakes the app when a new workout is saved (e.g. right after an Apple Watch ski session) and syncs it.
    func startBackgroundDelivery() {
        guard observer == nil, token != nil else { return }
        let q = HKObserverQuery(sampleType: HKObjectType.workoutType(), predicate: nil) { _, completion, error in
            // HealthKit wants this called exactly once, after we've handled the update.
            nonisolated(unsafe) let done = completion
            guard error == nil else {
                done()
                return
            }
            Task { @MainActor [weak self] in
                await self?.syncNow()
                done()
            }
        }
        store.execute(q)
        observer = q
        store.enableBackgroundDelivery(for: HKObjectType.workoutType(), frequency: .immediate) { _, _ in }
    }
}

extension HKWorkoutActivityType {
    var label: String {
        switch self {
        case .downhillSkiing: "Downhill skiing"
        case .snowboarding: "Snowboarding"
        case .crossCountrySkiing: "Cross-country skiing"
        default: "Snow sports"
        }
    }
}

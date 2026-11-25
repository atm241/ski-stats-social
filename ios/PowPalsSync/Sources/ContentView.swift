import SwiftUI

/// One screen: connect your account, allow Health access, see ski workouts and their sync state.
struct ContentView: View {
    @Environment(HealthSync.self) private var sync
    @State private var server = ""
    @State private var token = ""

    private let accent = Color(red: 0.36, green: 0.78, blue: 1)
    private let surface = Color(red: 0.063, green: 0.078, blue: 0.106)

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if let name = sync.connectedAs {
                        LabeledContent("Connected as", value: name)
                        LabeledContent("Server", value: sync.serverURL)
                        Button("Disconnect", role: .destructive) { sync.disconnect() }
                    } else {
                        TextField("Server URL", text: $server)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                        SecureField("Sync token (pp_…)", text: $token)
                        Button("Connect") { Task { await sync.connect(serverURL: server, token: token) } }
                            .disabled(server.isEmpty || !token.hasPrefix("pp_"))
                    }
                } header: {
                    Text("Account")
                } footer: {
                    if sync.connectedAs == nil {
                        Text("On the website: Settings → iPhone sync → Create token, then paste it here.")
                    }
                }

                Section {
                    Button {
                        Task { await sync.requestAccess() }
                    } label: {
                        Label("Allow access to ski workouts", systemImage: "heart.text.square")
                    }
                    Button {
                        Task { await sync.syncNow() }
                    } label: {
                        HStack {
                            Label("Sync now", systemImage: "arrow.triangle.2.circlepath")
                            Spacer()
                            if sync.busy { ProgressView() }
                        }
                    }
                    .disabled(sync.busy || sync.connectedAs == nil)
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        if !sync.status.isEmpty { Text(sync.status) }
                        if let last = sync.lastSync { Text("Last sync \(last.formatted(.relative(presentation: .named)))") }
                        Text("New Apple Watch ski and snowboard workouts sync automatically in the background.")
                    }
                }

                Section("Ski workouts") {
                    if sync.workouts.isEmpty {
                        Text("No skiing or snowboarding workouts yet. Record one with the Workout app on your Apple Watch.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(sync.workouts) { w in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(w.start.formatted(date: .abbreviated, time: .shortened))
                                Text("\(w.type.label) · \(Duration.seconds(w.end.timeIntervalSince(w.start)).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated)))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: w.synced ? "checkmark.circle.fill" : "circle.dashed")
                                .foregroundStyle(w.synced ? accent : .secondary)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color(red: 0.035, green: 0.043, blue: 0.063))
            .listRowBackground(surface)
            .navigationTitle("Gapr")
            .tint(accent)
            .task {
                server = sync.serverURL
                await sync.refresh()
            }
            .refreshable { await sync.refresh() }
        }
    }
}

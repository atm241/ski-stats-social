import Foundation

/// The Pow Pals web API: token check and GPX upload (multipart, Bearer token).
struct API {
    var baseURL: URL
    var token: String

    struct Me: Decodable { let username: String; let displayName: String }
    struct UploadResponse: Decodable {
        struct Result: Decodable {
            struct Saved: Decodable { let id: String; let localDate: String; let resortName: String?; let verticalM: Double }
            let fileName: String
            let saved: [Saved]
            let notes: [String]
            let error: String?
        }
        let results: [Result]
    }
    enum Failure: LocalizedError {
        case http(Int, String)
        var errorDescription: String? {
            switch self { case let .http(code, msg): "Server said \(code): \(msg)" }
        }
    }

    func me() async throws -> Me {
        var req = URLRequest(url: baseURL.appending(path: "api/me"))
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await send(req)
    }

    func upload(files: [(name: String, gpx: String)]) async throws -> UploadResponse {
        let boundary = "PowPals-\(UUID().uuidString)"
        var body = Data()
        func field(_ s: String) { body.append(s.data(using: .utf8)!) }
        field("--\(boundary)\r\nContent-Disposition: form-data; name=\"source\"\r\n\r\nhealth\r\n")
        for f in files {
            field("--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"\(f.name)\"\r\nContent-Type: application/gpx+xml\r\n\r\n")
            field(f.gpx)
            field("\r\n")
        }
        field("--\(boundary)--\r\n")
        var req = URLRequest(url: baseURL.appending(path: "api/uploads"))
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        return try await send(req)
    }

    private func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? String(decoding: data, as: UTF8.self)
            throw Failure.http(code, msg)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

import Capacitor
import Foundation
import PhotosUI
import UniformTypeIdentifiers

/// App-local plugin behind src/media/native: pick videos, compress them on the
/// device and upload byte ranges straight from disk. Registered by
/// MainViewController. Mirrors android/.../media/LiveSpaceMediaPlugin.java.
@objc(LiveSpaceMediaPlugin)
public class LiveSpaceMediaPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "LiveSpaceMediaPlugin"
    public let jsName = "LiveSpaceMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickVideos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVideoInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "compressVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uploadFileRange", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteFile", returnType: CAPPluginReturnPromise),
    ]

    private let compressor = VideoCompressor()
    private var pendingPickCall: CAPPluginCall?
    private var pendingPickLimit = 10

    // MARK: - Picking

    @objc func pickVideos(_ call: CAPPluginCall) {
        let limit = max(1, min(call.getInt("limit") ?? 10, 50))
        DispatchQueue.main.async {
            var configuration = PHPickerConfiguration()
            configuration.filter = .videos
            configuration.selectionLimit = limit
            // Hand over the original file, without transcoding HEVC to H.264.
            configuration.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            self.pendingPickCall = call
            self.pendingPickLimit = limit
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pendingPickCall else { return }
        pendingPickCall = nil

        let group = DispatchGroup()
        let lock = NSLock()
        var picked: [Int: JSObject] = [:]
        for (index, result) in results.prefix(pendingPickLimit).enumerated() {
            let provider = result.itemProvider
            guard provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) else { continue }
            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, _ in
                defer { group.leave() }
                // The provided file is deleted when this block returns: copy it.
                guard let url = url, let directory = try? VideoCompressor.workDirectory() else { return }
                let ext = url.pathExtension.isEmpty ? "mov" : url.pathExtension.lowercased()
                let destination = directory.appendingPathComponent("src-\(UUID().uuidString).\(ext)")
                do {
                    try FileManager.default.copyItem(at: url, to: destination)
                } catch {
                    return
                }
                var object = LiveSpaceMediaPlugin.infoToJs(VideoCompressor.info(for: destination))
                object["path"] = destination.path
                lock.lock()
                picked[index] = object
                lock.unlock()
            }
        }
        group.notify(queue: .main) {
            let videos = picked.keys.sorted().compactMap { picked[$0] }
            call.resolve(["videos": videos])
        }
    }

    // MARK: - Metadata and compression

    @objc func getVideoInfo(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), !path.isEmpty else {
            call.reject("path is required")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            var object = LiveSpaceMediaPlugin.infoToJs(VideoCompressor.info(for: VideoCompressor.fileURL(from: path)))
            object["path"] = path
            call.resolve(object)
        }
    }

    @objc func compressVideo(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), !path.isEmpty else {
            call.reject("path is required")
            return
        }
        var options = VideoCompressor.Options()
        options.maxDurationSeconds = Double(clamp(call.getInt("maxDurationSeconds") ?? 45, 1, 600))
        options.maxLongSide = Double(clamp(call.getInt("maxLongSide") ?? 1280, 160, 3840))
        options.maxShortSide = Double(clamp(call.getInt("maxShortSide") ?? 720, 120, 2160))
        options.videoBitrate = clamp(call.getInt("videoBitrate") ?? 2_500_000, 250_000, 20_000_000)
        options.audioBitrate = clamp(call.getInt("audioBitrate") ?? 128_000, 32_000, 320_000)
        let taskId = call.getString("taskId") ?? ""

        var lastReported = -1
        compressor.compress(
            input: VideoCompressor.fileURL(from: path),
            options: options,
            progress: { [weak self] value in
                let percent = Int(value * 100)
                guard percent != lastReported else { return }
                lastReported = percent
                self?.notifyListeners("compressProgress", data: ["taskId": taskId, "progress": value])
            },
            completion: { result in
                switch result {
                case .success(let output):
                    call.resolve([
                        "path": output.path,
                        "thumbnailPath": LiveSpaceMediaPlugin.jsOptional(output.thumbnailPath),
                        "sizeBytes": Int(output.sizeBytes),
                        "durationSeconds": output.durationSeconds,
                        "width": output.width,
                        "height": output.height,
                        "trimmed": output.trimmed,
                        "contentType": "video/mp4",
                        "capturedAt": LiveSpaceMediaPlugin.jsOptional(output.source.capturedAt),
                        "location": LiveSpaceMediaPlugin.locationToJs(output.source),
                    ])
                case .failure(let error):
                    call.reject(error.localizedDescription, nil, error)
                }
            }
        )
    }

    // MARK: - Upload

    @objc func uploadFileRange(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let urlString = call.getString("url"),
              let url = URL(string: urlString), url.scheme == "https",
              let length = call.getInt("length"), length > 0
        else {
            call.reject("path, https url and length are required")
            return
        }
        let offset = call.getInt("offset") ?? 0
        let taskId = call.getString("taskId") ?? ""
        var headers: [String: String] = [:]
        for (key, value) in call.getObject("headers") ?? [:] {
            if let value = value as? String { headers[key] = value }
        }

        Task {
            do {
                let fileURL = VideoCompressor.fileURL(from: path)
                let handle = try FileHandle(forReadingFrom: fileURL)
                defer { try? handle.close() }
                try handle.seek(toOffset: UInt64(max(0, offset)))
                let data = handle.readData(ofLength: length)
                guard data.count == length else {
                    call.reject("The upload file is shorter than expected")
                    return
                }

                var request = URLRequest(url: url)
                request.httpMethod = "PUT"
                request.timeoutInterval = 120
                for (key, value) in headers where key.lowercased() != "content-length" && key.lowercased() != "host" {
                    request.setValue(value, forHTTPHeaderField: key)
                }
                let delegate = UploadProgressDelegate { [weak self] sent, total in
                    self?.notifyListeners("uploadProgress", data: [
                        "taskId": taskId, "sentBytes": Int(sent), "totalBytes": Int(total),
                    ])
                }
                let (_, response) = try await URLSession.shared.upload(for: request, from: data, delegate: delegate)
                let http = response as? HTTPURLResponse
                call.resolve([
                    "status": http?.statusCode ?? 0,
                    "etag": LiveSpaceMediaPlugin.jsOptional(http?.value(forHTTPHeaderField: "ETag")),
                ])
            } catch {
                call.reject("network_error", "NETWORK", error)
            }
        }
    }

    @objc func deleteFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("path is required")
            return
        }
        // Only files this plugin wrote may be deleted.
        if let directory = try? VideoCompressor.workDirectory() {
            let target = VideoCompressor.fileURL(from: path).standardizedFileURL.path
            if target.hasPrefix(directory.standardizedFileURL.path + "/") {
                try? FileManager.default.removeItem(atPath: target)
            }
        }
        call.resolve()
    }

    // MARK: - Helpers

    private func clamp(_ value: Int, _ minimum: Int, _ maximum: Int) -> Int {
        return max(minimum, min(maximum, value))
    }

    private static func infoToJs(_ info: VideoCompressor.Info) -> JSObject {
        return [
            "durationSeconds": info.durationSeconds,
            "width": info.width,
            "height": info.height,
            "sizeBytes": Int(info.sizeBytes),
            "capturedAt": jsOptional(info.capturedAt),
            "location": locationToJs(info),
        ]
    }

    private static func jsOptional(_ value: String?) -> JSValue {
        if let value = value { return value }
        return NSNull()
    }

    private static func locationToJs(_ info: VideoCompressor.Info) -> JSValue {
        guard let latitude = info.latitude, let longitude = info.longitude else { return NSNull() }
        return ["latitude": latitude, "longitude": longitude] as JSObject
    }
}

private final class UploadProgressDelegate: NSObject, URLSessionTaskDelegate {
    private let onProgress: (Int64, Int64) -> Void
    private var lastReported: Int64 = 0

    init(onProgress: @escaping (Int64, Int64) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesSent - lastReported >= 256 * 1024 || totalBytesSent == totalBytesExpectedToSend else { return }
        lastReported = totalBytesSent
        onProgress(totalBytesSent, totalBytesExpectedToSend)
    }
}

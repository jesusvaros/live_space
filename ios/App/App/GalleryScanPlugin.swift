import Foundation
import Capacitor
import CoreLocation
import Photos
import UIKit

/// Read-only scan of the camera roll for "upload with zero typing".
///
/// `findMedia({from, to, thumbnails?, limit?})` lists the photos and videos
/// whose creation date falls between two instants (epoch ms), with duration,
/// GPS when the asset has it and a small cached JPEG thumbnail. Nothing is
/// uploaded. `getUploadPath({id})` exports the original to a temporary file
/// only when the user confirms the upload.
///
/// Works with full and limited ("Seleccionar fotos…") access; with limited
/// access PhotoKit only returns the assets the user picked.
///
/// NOT BUILT OR RUN YET: written without Xcode at hand.
@objc(GalleryScanPlugin)
public class GalleryScanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GalleryScanPlugin"
    public let jsName = "GalleryScan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "findMedia", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUploadPath", returnType: CAPPluginReturnPromise)
    ]

    private static let defaultLimit = 300
    private static let thumbSize = CGSize(width: 320, height: 320)

    // MARK: - Permissions

    private func stateString(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .limited: return "limited"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "denied"
        }
    }

    private func canRead() -> Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        return status == .authorized || status == .limited
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["media": stateString(PHPhotoLibrary.authorizationStatus(for: .readWrite))])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] status in
            guard let self = self else { return }
            call.resolve(["media": self.stateString(status)])
        }
    }

    // MARK: - findMedia

    @objc func findMedia(_ call: CAPPluginCall) {
        guard let fromMs = call.getDouble("from"), let toMs = call.getDouble("to"), toMs >= fromMs else {
            call.reject("from y to son obligatorios", "INVALID_RANGE")
            return
        }
        guard canRead() else {
            call.reject("Sin acceso a la galería", "PERMISSION_DENIED")
            return
        }
        let wantThumbnails = call.getBool("thumbnails") ?? true
        let limit = call.getInt("limit") ?? GalleryScanPlugin.defaultLimit
        let from = Date(timeIntervalSince1970: fromMs / 1000)
        let to = Date(timeIntervalSince1970: toMs / 1000)

        DispatchQueue.global(qos: .userInitiated).async {
            let options = PHFetchOptions()
            options.predicate = NSPredicate(
                format: "creationDate >= %@ AND creationDate <= %@ AND (mediaType == %d OR mediaType == %d)",
                from as NSDate,
                to as NSDate,
                PHAssetMediaType.image.rawValue,
                PHAssetMediaType.video.rawValue
            )
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
            options.fetchLimit = limit
            options.includeAssetSourceTypes = [.typeUserLibrary, .typeCloudShared, .typeiTunesSynced]

            let result = PHAsset.fetchAssets(with: options)
            var assets: [[String: Any]] = []
            result.enumerateObjects { asset, _, _ in
                guard let created = asset.creationDate else { return }
                let isVideo = asset.mediaType == .video
                var item: [String: Any] = [
                    "id": asset.localIdentifier,
                    "kind": isVideo ? "video" : "photo",
                    "createdAt": created.timeIntervalSince1970 * 1000,
                    "width": asset.pixelWidth,
                    "height": asset.pixelHeight
                ]
                if isVideo { item["durationSec"] = asset.duration }
                if let coordinate = asset.location?.coordinate, CLLocationCoordinate2DIsValid(coordinate),
                   coordinate.latitude != 0 || coordinate.longitude != 0 {
                    item["lat"] = coordinate.latitude
                    item["lng"] = coordinate.longitude
                }
                if wantThumbnails, let path = self.thumbnail(for: asset) {
                    item["thumbnailPath"] = path
                }
                assets.append(item)
            }
            call.resolve(["assets": assets])
        }
    }

    /// Small JPEG in Caches/gallery-thumbs, reused between scans. file:// URL string.
    private func thumbnail(for asset: PHAsset) -> String? {
        let fileManager = FileManager.default
        guard let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let dir = caches.appendingPathComponent("gallery-thumbs", isDirectory: true)
        try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        let safeName = asset.localIdentifier.replacingOccurrences(of: "/", with: "_")
        let url = dir.appendingPathComponent("\(safeName).jpg")
        if fileManager.fileExists(atPath: url.path) { return url.absoluteString }

        let options = PHImageRequestOptions()
        options.isSynchronous = true
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        // A thumbnail must never trigger an iCloud download.
        options.isNetworkAccessAllowed = false

        var image: UIImage?
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: GalleryScanPlugin.thumbSize,
            contentMode: .aspectFill,
            options: options
        ) { result, _ in
            image = result
        }
        guard let data = image?.jpegData(compressionQuality: 0.75) else { return nil }
        do {
            try data.write(to: url, options: .atomic)
            return url.absoluteString
        } catch {
            return nil
        }
    }

    // MARK: - getUploadPath

    /// Exports the original resource to tmp/ and returns its file:// URL. May
    /// download from iCloud. The upload queue deletes the copy when it is done.
    @objc func getUploadPath(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("id no válido", "INVALID_ID")
            return
        }
        guard canRead() else {
            call.reject("Sin acceso a la galería", "PERMISSION_DENIED")
            return
        }
        guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
            call.reject("No se encontró el archivo", "NOT_FOUND")
            return
        }
        let resources = PHAssetResource.assetResources(for: asset)
        let preferred: [PHAssetResourceType] = asset.mediaType == .video
            ? [.fullSizeVideo, .video]
            : [.fullSizePhoto, .photo]
        guard let resource = preferred.compactMap({ type in resources.first(where: { $0.type == type }) }).first
            ?? resources.first else {
            call.reject("No se encontró el archivo", "NOT_FOUND")
            return
        }

        let ext = (resource.originalFilename as NSString).pathExtension
        let name = "livespace-upload-\(UUID().uuidString)" + (ext.isEmpty ? "" : ".\(ext)")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true

        PHAssetResourceManager.default().writeData(for: resource, toFile: url, options: options) { error in
            if let error = error {
                call.reject("No se pudo preparar el archivo", "EXPORT_FAILED", error)
                return
            }
            call.resolve(["path": url.absoluteString])
        }
    }
}

import AVFoundation
import UIKit

/// Transcodes a picked video to the upload format: H.264 + AAC in MP4, at most
/// 720p, ~2.5 Mbps video and 128 kbps audio, trimmed to the first N seconds,
/// faststart (moov first) and without metadata, so no GPS leaves the device.
final class VideoCompressor {
    struct Options {
        var maxDurationSeconds: Double = 45
        var maxLongSide: Double = 1280
        var maxShortSide: Double = 720
        var videoBitrate: Int = 2_500_000
        var audioBitrate: Int = 128_000
    }

    struct Info {
        var durationSeconds: Double
        var width: Int
        var height: Int
        var sizeBytes: Int64
        var capturedAt: String?
        var latitude: Double?
        var longitude: Double?
    }

    struct Output {
        var path: String
        var thumbnailPath: String?
        var sizeBytes: Int64
        var durationSeconds: Double
        var width: Int
        var height: Int
        var trimmed: Bool
        var source: Info
    }

    enum CompressionError: LocalizedError {
        case noVideoTrack
        case readerFailed(Error?)
        case writerFailed(Error?)

        var errorDescription: String? {
            switch self {
            case .noVideoTrack: return "El archivo no parece un vídeo válido."
            case .readerFailed: return "No se pudo leer el vídeo."
            case .writerFailed: return "No se pudo comprimir el vídeo."
            }
        }
    }

    private let workQueue = DispatchQueue(label: "com.livespace.media.compress")

    static func workDirectory() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var directory = base.appendingPathComponent("ls-uploads", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? directory.setResourceValues(values)
        return directory
    }

    static func fileURL(from path: String) -> URL {
        if path.hasPrefix("file://"), let url = URL(string: path) { return url }
        return URL(fileURLWithPath: path)
    }

    // MARK: - Metadata

    static func info(for url: URL) -> Info {
        let asset = AVURLAsset(url: url)
        let track = asset.tracks(withMediaType: .video).first
        var width = 0
        var height = 0
        if let track = track {
            let size = track.naturalSize.applying(track.preferredTransform)
            width = Int(abs(size.width).rounded())
            height = Int(abs(size.height).rounded())
        }
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        let size = (attributes?[.size] as? NSNumber)?.int64Value ?? -1
        let location = location(of: asset)
        return Info(
            durationSeconds: asset.duration.seconds.isFinite ? asset.duration.seconds : 0,
            width: width,
            height: height,
            sizeBytes: size,
            capturedAt: creationDate(of: asset),
            latitude: location?.0,
            longitude: location?.1
        )
    }

    private static func creationDate(of asset: AVAsset) -> String? {
        var date = asset.creationDate?.dateValue
        if date == nil {
            let item = asset.metadata.first { $0.identifier == .quickTimeMetadataCreationDate }
            if let value = item?.stringValue {
                date = ISO8601DateFormatter().date(from: value)
            }
        }
        guard let resolved = date, resolved.timeIntervalSince1970 > 0 else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: resolved)
    }

    /// QuickTime stores GPS as an ISO 6709 string such as "+40.4168-003.7038+650.000/".
    private static func location(of asset: AVAsset) -> (Double, Double)? {
        let item = asset.metadata.first {
            $0.identifier == .quickTimeMetadataLocationISO6709 || $0.commonKey == .commonKeyLocation
        }
        guard let value = item?.stringValue else { return nil }
        guard let regex = try? NSRegularExpression(pattern: "([+-]\\d+(?:\\.\\d+)?)([+-]\\d+(?:\\.\\d+)?)") else {
            return nil
        }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        guard let match = regex.firstMatch(in: value, range: range),
              let latRange = Range(match.range(at: 1), in: value),
              let lngRange = Range(match.range(at: 2), in: value),
              let latitude = Double(value[latRange]),
              let longitude = Double(value[lngRange]),
              abs(latitude) <= 90, abs(longitude) <= 180,
              !(latitude == 0 && longitude == 0)
        else { return nil }
        return (latitude, longitude)
    }

    // MARK: - Compression

    func compress(
        input: URL,
        options: Options,
        progress: @escaping (Double) -> Void,
        completion: @escaping (Result<Output, Error>) -> Void
    ) {
        workQueue.async {
            do {
                try self.run(input: input, options: options, progress: progress, completion: completion)
            } catch {
                completion(.failure(error))
            }
        }
    }

    private func run(
        input: URL,
        options: Options,
        progress: @escaping (Double) -> Void,
        completion: @escaping (Result<Output, Error>) -> Void
    ) throws {
        let source = VideoCompressor.info(for: input)
        let asset = AVURLAsset(url: input)
        guard let videoTrack = asset.tracks(withMediaType: .video).first else {
            throw CompressionError.noVideoTrack
        }
        let audioTrack = asset.tracks(withMediaType: .audio).first

        let assetDuration = asset.duration
        let trimmed = assetDuration.seconds > options.maxDurationSeconds + 0.25
        let duration = trimmed
            ? CMTime(seconds: options.maxDurationSeconds, preferredTimescale: 600)
            : assetDuration
        let timeRange = CMTimeRange(start: .zero, duration: duration)

        // Bake the rotation in and scale to fit 720p.
        let transform = videoTrack.preferredTransform
        let displaySize = videoTrack.naturalSize.applying(transform)
        let displayWidth = Double(abs(displaySize.width))
        let displayHeight = Double(abs(displaySize.height))
        guard displayWidth > 0, displayHeight > 0 else { throw CompressionError.noVideoTrack }
        let scale: Double = min(
            1.0,
            options.maxLongSide / max(displayWidth, displayHeight),
            options.maxShortSide / min(displayWidth, displayHeight)
        )
        let renderWidth = VideoCompressor.even(displayWidth * scale)
        let renderHeight = VideoCompressor.even(displayHeight * scale)
        let frameRate = videoTrack.nominalFrameRate > 0 ? min(videoTrack.nominalFrameRate, 60) : 30

        let composition = AVMutableVideoComposition()
        composition.renderSize = CGSize(width: renderWidth, height: renderHeight)
        composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(frameRate.rounded()))
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: assetDuration)
        let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
        layerInstruction.setTransform(
            transform.concatenating(CGAffineTransform(scaleX: CGFloat(scale), y: CGFloat(scale))), at: .zero)
        instruction.layerInstructions = [layerInstruction]
        composition.instructions = [instruction]

        let reader = try AVAssetReader(asset: asset)
        reader.timeRange = timeRange
        let videoOutput = AVAssetReaderVideoCompositionOutput(
            videoTracks: [videoTrack],
            videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
        )
        videoOutput.videoComposition = composition
        videoOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(videoOutput) else { throw CompressionError.readerFailed(nil) }
        reader.add(videoOutput)

        let outputURL = try VideoCompressor.workDirectory().appendingPathComponent("\(UUID().uuidString).mp4")
        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true // moov atom first (faststart)
        writer.metadata = [] // no GPS, no device info

        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: renderWidth,
            AVVideoHeightKey: renderHeight,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: options.videoBitrate,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoMaxKeyFrameIntervalDurationKey: 2,
                AVVideoExpectedSourceFrameRateKey: Int(frameRate.rounded()),
            ] as [String: Any],
        ])
        videoInput.expectsMediaDataInRealTime = false
        guard writer.canAdd(videoInput) else { throw CompressionError.writerFailed(nil) }
        writer.add(videoInput)

        // Audio is optional: when the writer or reader refuses it the clip is
        // exported without sound instead of failing. A reader output is only
        // added when its writer input exists, so no output is left unread.
        var audioOutput: AVAssetReaderTrackOutput?
        var audioInput: AVAssetWriterInput?
        if let audioTrack = audioTrack {
            let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVNumberOfChannelsKey: 2,
                AVSampleRateKey: 44_100,
                AVEncoderBitRateKey: options.audioBitrate,
            ])
            input.expectsMediaDataInRealTime = false
            let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 2,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false,
            ])
            output.alwaysCopiesSampleData = false
            if writer.canAdd(input) && reader.canAdd(output) {
                writer.add(input)
                reader.add(output)
                audioInput = input
                audioOutput = output
            }
        }

        guard writer.startWriting() else { throw CompressionError.writerFailed(writer.error) }
        guard reader.startReading() else {
            writer.cancelWriting()
            throw CompressionError.readerFailed(reader.error)
        }
        writer.startSession(atSourceTime: .zero)

        let group = DispatchGroup()
        let totalSeconds = max(duration.seconds, 0.001)

        func pump(input: AVAssetWriterInput, output: AVAssetReaderOutput, label: String, reportsProgress: Bool) {
            group.enter()
            var finished = false
            let queue = DispatchQueue(label: "com.livespace.media.\(label)")
            input.requestMediaDataWhenReady(on: queue) {
                while input.isReadyForMoreMediaData && !finished {
                    guard reader.status == .reading, let sample = output.copyNextSampleBuffer() else {
                        finished = true
                        input.markAsFinished()
                        group.leave()
                        return
                    }
                    if reportsProgress {
                        let seconds = CMSampleBufferGetPresentationTimeStamp(sample).seconds
                        if seconds.isFinite { progress(min(1, max(0, seconds / totalSeconds))) }
                    }
                    if !input.append(sample) {
                        finished = true
                        reader.cancelReading()
                        input.markAsFinished()
                        group.leave()
                        return
                    }
                }
            }
        }

        pump(input: videoInput, output: videoOutput, label: "video", reportsProgress: true)
        if let audioInput = audioInput, let audioOutput = audioOutput {
            pump(input: audioInput, output: audioOutput, label: "audio", reportsProgress: false)
        }

        group.notify(queue: workQueue) {
            if reader.status == .failed || writer.status == .failed {
                let error = writer.error ?? reader.error
                writer.cancelWriting()
                try? FileManager.default.removeItem(at: outputURL)
                completion(.failure(CompressionError.writerFailed(error)))
                return
            }
            writer.finishWriting {
                guard writer.status == .completed else {
                    try? FileManager.default.removeItem(at: outputURL)
                    completion(.failure(CompressionError.writerFailed(writer.error)))
                    return
                }
                let produced = VideoCompressor.info(for: outputURL)
                let thumbnail = VideoCompressor.writeThumbnail(for: outputURL, durationSeconds: produced.durationSeconds)
                completion(.success(Output(
                    path: outputURL.path,
                    thumbnailPath: thumbnail,
                    sizeBytes: produced.sizeBytes,
                    durationSeconds: produced.durationSeconds,
                    width: produced.width,
                    height: produced.height,
                    trimmed: trimmed,
                    source: source
                )))
            }
        }
    }

    /// A JPEG frame (max 720 px) the web layer uploads as the poster image.
    static func writeThumbnail(for url: URL, durationSeconds: Double) -> String? {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 720, height: 720)
        let time = CMTime(seconds: min(1.0, max(0, durationSeconds / 2)), preferredTimescale: 600)
        guard let image = try? generator.copyCGImage(at: time, actualTime: nil),
              let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.8)
        else { return nil }
        let thumbnailURL = url.deletingPathExtension().appendingPathExtension("jpg")
        do {
            try data.write(to: thumbnailURL, options: .atomic)
            return thumbnailURL.path
        } catch {
            return nil
        }
    }

    private static func even(_ value: Double) -> Int {
        let rounded = Int(value.rounded())
        return max(2, rounded - rounded % 2)
    }
}

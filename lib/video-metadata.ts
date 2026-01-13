export interface VideoMetadata {
  duration?: number // in seconds
  width?: number
  height?: number
  creationTime?: Date
  latitude?: number
  longitude?: number
  fileSize?: number
}

/**
 * Extract metadata from a video file
 * Note: Browser APIs have limited access to video metadata
 * GPS coordinates are typically not accessible from browser
 */
export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      const metadata: VideoMetadata = {
        duration: Math.floor(video.duration),
        width: video.videoWidth,
        height: video.videoHeight,
        fileSize: file.size,
        // Try to get creation time from file's lastModified
        creationTime: new Date(file.lastModified)
      }

      // Clean up
      URL.revokeObjectURL(video.src)
      resolve(metadata)
    }

    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      reject(new Error('Failed to load video metadata'))
    }

    video.src = URL.createObjectURL(file)
  })
}

/**
 * Generate a thumbnail from a video file
 * @param file Video file
 * @param seekTo Time in seconds to capture thumbnail (default: 1 second)
 */
export async function generateVideoThumbnail(
  file: File,
  seekTo: number = 1
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      reject(new Error('Could not get canvas context'))
      return
    }

    video.preload = 'metadata'
    video.currentTime = seekTo

    video.onseeked = () => {
      // Set canvas dimensions to video dimensions
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Convert canvas to blob
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(video.src)
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to generate thumbnail'))
          }
        },
        'image/jpeg',
        0.8
      )
    }

    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      reject(new Error('Failed to load video for thumbnail'))
    }

    video.src = URL.createObjectURL(file)
  })
}

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Format duration to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

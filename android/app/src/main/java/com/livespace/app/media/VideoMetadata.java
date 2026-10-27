package com.livespace.app.media;

import android.content.Context;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.File;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Capture metadata read from the source video (QuickTime/MP4 atoms). */
final class VideoMetadata {
  long durationMs;
  int width;
  int height;
  int rotation;
  long sizeBytes = -1;
  /** ISO-8601 UTC string, or null when the file has no creation date. */
  String capturedAt;
  Double latitude;
  Double longitude;

  int displayWidth() {
    return rotation == 90 || rotation == 270 ? height : width;
  }

  int displayHeight() {
    return rotation == 90 || rotation == 270 ? width : height;
  }

  static Uri toUri(String path) {
    if (path.startsWith("content://") || path.startsWith("file://")) return Uri.parse(path);
    return Uri.fromFile(new File(path));
  }

  static VideoMetadata read(Context context, String path) throws Exception {
    VideoMetadata metadata = new VideoMetadata();
    Uri uri = toUri(path);
    MediaMetadataRetriever retriever = new MediaMetadataRetriever();
    try {
      if ("file".equals(uri.getScheme())) {
        retriever.setDataSource(uri.getPath());
      } else {
        retriever.setDataSource(context, uri);
      }
      metadata.durationMs = parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
      metadata.width = (int) parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
      metadata.height = (int) parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
      metadata.rotation = (int) parseLong(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
      metadata.capturedAt = parseDate(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE));
      parseLocation(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_LOCATION), metadata);
    } finally {
      try {
        retriever.release();
      } catch (Exception ignored) {
        // Nothing to release.
      }
    }
    metadata.sizeBytes = sizeOf(context, uri);
    return metadata;
  }

  static long sizeOf(Context context, Uri uri) {
    if ("file".equals(uri.getScheme())) {
      File file = new File(uri.getPath());
      return file.exists() ? file.length() : -1;
    }
    try (Cursor cursor = context.getContentResolver().query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
      if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0);
    } catch (Exception ignored) {
      // Unknown size.
    }
    return -1;
  }

  private static long parseLong(String value) {
    if (value == null) return 0;
    try {
      return Long.parseLong(value.trim());
    } catch (NumberFormatException error) {
      return 0;
    }
  }

  /** MediaMetadataRetriever returns dates like 20261027T213000.000Z. */
  private static String parseDate(String value) {
    if (value == null || value.trim().isEmpty()) return null;
    String[] patterns = { "yyyyMMdd'T'HHmmss.SSS'Z'", "yyyyMMdd'T'HHmmss'Z'", "yyyyMMdd'T'HHmmss" };
    for (String pattern : patterns) {
      try {
        SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        format.setLenient(false);
        Date date = format.parse(value.trim());
        // 1904-01-01 is the QuickTime epoch: files without a real date report it.
        if (date == null || date.getTime() <= 0) continue;
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        return iso.format(date);
      } catch (ParseException ignored) {
        // Try the next pattern.
      }
    }
    return null;
  }

  private static final Pattern ISO_6709 = Pattern.compile("([+-]\\d+(?:\\.\\d+)?)([+-]\\d+(?:\\.\\d+)?)");

  /** ISO 6709 strings such as +40.4168-003.7038/ or +40.4168-003.7038+650.000/. */
  static void parseLocation(String value, VideoMetadata metadata) {
    if (value == null) return;
    Matcher matcher = ISO_6709.matcher(value.trim());
    if (!matcher.find()) return;
    try {
      double latitude = Double.parseDouble(matcher.group(1));
      double longitude = Double.parseDouble(matcher.group(2));
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
      if (latitude == 0 && longitude == 0) return;
      metadata.latitude = latitude;
      metadata.longitude = longitude;
    } catch (NumberFormatException ignored) {
      // No usable location.
    }
  }
}

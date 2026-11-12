package com.livespace.app.media;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.util.Size;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

/**
 * A photo or video picked with the system picker (pickMedia): its kind, size,
 * capture metadata and a small JPEG preview for the uploader. The location is
 * handed to the web layer only to choose the concert; it is never uploaded.
 */
final class PickedMedia {
  private static final int THUMBNAIL_SIDE = 320;
  private static final String THUMBNAIL_PREFIX = "pick-";
  private static final long THUMBNAIL_MAX_AGE_MS = 2L * 24 * 60 * 60 * 1000;

  private PickedMedia() {}

  static JSObject read(Context context, Uri uri) throws Exception {
    ContentResolver resolver = context.getContentResolver();
    String mimeType = resolver.getType(uri);
    boolean video = mimeType != null ? mimeType.startsWith("video/") : looksLikeVideo(context, uri);

    JSObject item = new JSObject();
    item.put("path", uri.toString());
    item.put("mimeType", mimeType);
    item.put("sizeBytes", VideoMetadata.sizeOf(context, uri));
    Long dateTaken = dateTaken(resolver, uri);
    if (video) {
      VideoMetadata metadata = VideoMetadata.read(context, uri.toString());
      if (metadata.durationMs <= 0) throw new IllegalArgumentException("Not a readable video");
      item.put("kind", "video");
      item.put("durationSeconds", metadata.durationMs / 1000.0);
      item.put("width", metadata.displayWidth());
      item.put("height", metadata.displayHeight());
      item.put("capturedAt", metadata.capturedAt != null ? metadata.capturedAt : isoOrNull(dateTaken));
      item.put("location", location(metadata.latitude, metadata.longitude));
    } else {
      item.put("kind", "image");
      item.put("durationSeconds", 0);
      readImage(resolver, uri, item, dateTaken);
    }
    item.put("thumbnailPath", writeThumbnail(context, uri, video));
    return item;
  }

  /** Drops old picker previews; the uploader deletes the ones it used. */
  static void cleanOldThumbnails(Context context) {
    File[] files = VideoCompressor.workDirectory(context).listFiles();
    if (files == null) return;
    long now = System.currentTimeMillis();
    for (File file : files) {
      if (file.getName().startsWith(THUMBNAIL_PREFIX) && now - file.lastModified() > THUMBNAIL_MAX_AGE_MS) {
        //noinspection ResultOfMethodCallIgnored
        file.delete();
      }
    }
  }

  private static boolean looksLikeVideo(Context context, Uri uri) {
    try {
      return VideoMetadata.read(context, uri.toString()).durationMs > 0;
    } catch (Exception error) {
      return false;
    }
  }

  private static void readImage(ContentResolver resolver, Uri uri, JSObject item, Long dateTaken) {
    String capturedAt = null;
    Object location = JSObject.NULL;
    int width = 0;
    int height = 0;
    try (InputStream stream = resolver.openInputStream(uri)) {
      if (stream != null) {
        ExifInterface exif = new ExifInterface(stream);
        capturedAt = exifDate(exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL), exif.getAttribute("OffsetTimeOriginal"));
        if (capturedAt == null) capturedAt = exifDate(exif.getAttribute(ExifInterface.TAG_DATETIME), exif.getAttribute("OffsetTime"));
        float[] latLong = new float[2];
        if (exif.getLatLong(latLong)) location = location((double) latLong[0], (double) latLong[1]);
        width = exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0);
        height = exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0);
        int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        if (orientation >= ExifInterface.ORIENTATION_TRANSPOSE) {
          int swap = width;
          width = height;
          height = swap;
        }
      }
    } catch (Exception ignored) {
      // Not every format carries EXIF (PNG, screenshots…).
    }
    if (width <= 0 || height <= 0) {
      try (InputStream stream = resolver.openInputStream(uri)) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeStream(stream, null, bounds);
        width = Math.max(0, bounds.outWidth);
        height = Math.max(0, bounds.outHeight);
      } catch (Exception ignored) {
        // Unknown size.
      }
    }
    item.put("capturedAt", capturedAt != null ? capturedAt : isoOrNull(dateTaken));
    item.put("location", location);
    item.put("width", width);
    item.put("height", height);
  }

  /** MediaStore's DATE_TAKEN (the photo picker exposes it), in ms, or null. */
  private static Long dateTaken(ContentResolver resolver, Uri uri) {
    try (Cursor cursor = resolver.query(uri, new String[] { "datetaken" }, null, null, null)) {
      if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
        long value = cursor.getLong(0);
        return value > 0 ? value : null;
      }
    } catch (Exception ignored) {
      // Not every provider has the column.
    }
    return null;
  }

  /** EXIF dates are local time ("yyyy:MM:dd HH:mm:ss"), with an optional "+01:00" offset. */
  private static String exifDate(String value, String offset) {
    if (value == null || value.trim().isEmpty()) return null;
    try {
      SimpleDateFormat format = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
      format.setLenient(false);
      if (offset != null && offset.matches("[+-]\\d{2}:\\d{2}")) {
        format.setTimeZone(TimeZone.getTimeZone("GMT" + offset));
      }
      Date date = format.parse(value.trim());
      return date == null || date.getTime() <= 0 ? null : iso(date.getTime());
    } catch (ParseException error) {
      return null;
    }
  }

  private static String isoOrNull(Long millis) {
    return millis == null ? null : iso(millis);
  }

  private static String iso(long millis) {
    SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
    iso.setTimeZone(TimeZone.getTimeZone("UTC"));
    return iso.format(new Date(millis));
  }

  private static Object location(Double latitude, Double longitude) {
    if (latitude == null || longitude == null) return JSObject.NULL;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude == 0 && longitude == 0)) return JSObject.NULL;
    JSObject location = new JSObject();
    location.put("latitude", latitude);
    location.put("longitude", longitude);
    return location;
  }

  /** A small JPEG preview in the upload folder, or null. */
  private static Object writeThumbnail(Context context, Uri uri, boolean video) {
    Bitmap bitmap = null;
    try {
      if (Build.VERSION.SDK_INT >= 29) {
        bitmap = context.getContentResolver().loadThumbnail(uri, new Size(THUMBNAIL_SIDE, THUMBNAIL_SIDE), null);
      } else if (video) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
          retriever.setDataSource(context, uri);
          Bitmap frame = retriever.getFrameAtTime(500_000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
          if (frame != null) bitmap = scaled(frame);
        } finally {
          try {
            retriever.release();
          } catch (Exception ignored) {
            // Nothing to release.
          }
        }
      } else {
        bitmap = sampledImage(context.getContentResolver(), uri);
      }
      if (bitmap == null) return JSObject.NULL;
      File file = new File(VideoCompressor.workDirectory(context), THUMBNAIL_PREFIX + UUID.randomUUID() + ".jpg");
      try (FileOutputStream stream = new FileOutputStream(file)) {
        bitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream);
      }
      return file.getAbsolutePath();
    } catch (Exception error) {
      return JSObject.NULL;
    } finally {
      if (bitmap != null) bitmap.recycle();
    }
  }

  private static Bitmap sampledImage(ContentResolver resolver, Uri uri) throws Exception {
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    try (InputStream stream = resolver.openInputStream(uri)) {
      BitmapFactory.decodeStream(stream, null, bounds);
    }
    int sample = 1;
    while (bounds.outWidth / (sample * 2) >= THUMBNAIL_SIDE && bounds.outHeight / (sample * 2) >= THUMBNAIL_SIDE) sample *= 2;
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inSampleSize = sample;
    try (InputStream stream = resolver.openInputStream(uri)) {
      Bitmap decoded = BitmapFactory.decodeStream(stream, null, options);
      return decoded == null ? null : scaled(decoded);
    }
  }

  private static Bitmap scaled(Bitmap source) {
    int longSide = Math.max(source.getWidth(), source.getHeight());
    if (longSide <= THUMBNAIL_SIDE * 2) return source;
    float factor = (THUMBNAIL_SIDE * 2f) / longSide;
    Bitmap result = Bitmap.createScaledBitmap(
      source, Math.round(source.getWidth() * factor), Math.round(source.getHeight() * factor), true);
    if (result != source) source.recycle();
    return result;
  }
}

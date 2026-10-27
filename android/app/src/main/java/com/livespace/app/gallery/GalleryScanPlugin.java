package com.livespace.app.gallery;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Size;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Read-only scan of the camera roll for "upload with zero typing".
 *
 * findMedia({from, to, thumbnails?, limit?}) lists the photos and videos taken
 * between two instants (epoch ms) with their capture time, duration, GPS when
 * the file carries it and a small cached JPEG thumbnail. Nothing is uploaded or
 * copied anywhere but the app cache. getUploadPath({id}) returns the content://
 * URI the upload queue reads when the user confirms.
 *
 * Permissions: READ_MEDIA_IMAGES + READ_MEDIA_VIDEO on API 33+, plus
 * READ_MEDIA_VISUAL_USER_SELECTED on 34+ (partial access, reported as
 * "limited"), READ_EXTERNAL_STORAGE up to API 32 and ACCESS_MEDIA_LOCATION on
 * 29+ so MediaStore does not redact the GPS tags.
 */
@CapacitorPlugin(
    name = "GalleryScan",
    permissions = {
        @Permission(
            strings = { Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO },
            alias = GalleryScanPlugin.MEDIA_MODERN
        ),
        @Permission(strings = { Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED }, alias = GalleryScanPlugin.MEDIA_PARTIAL),
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = GalleryScanPlugin.MEDIA_LEGACY),
        @Permission(strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }, alias = GalleryScanPlugin.MEDIA_LOCATION)
    }
)
public class GalleryScanPlugin extends Plugin {

    static final String MEDIA_MODERN = "mediaModern";
    static final String MEDIA_PARTIAL = "mediaPartial";
    static final String MEDIA_LEGACY = "mediaLegacy";
    static final String MEDIA_LOCATION = "mediaLocation";

    private static final int DEFAULT_LIMIT = 300;
    private static final int THUMB_SIZE = 320;
    // ISO 6709 as written by MediaMetadataRetriever: "+40.4168-003.7038/"
    private static final Pattern ISO6709 = Pattern.compile("([+-]\\d+(?:\\.\\d+)?)([+-]\\d+(?:\\.\\d+)?)");

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    // ---- permissions -------------------------------------------------------

    private String[] aliasesToRequest() {
        List<String> aliases = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            aliases.add(MEDIA_MODERN);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) aliases.add(MEDIA_PARTIAL);
        } else {
            aliases.add(MEDIA_LEGACY);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) aliases.add(MEDIA_LOCATION);
        return aliases.toArray(new String[0]);
    }

    /** "granted" | "limited" | "denied" | "prompt" | "prompt-with-rationale" */
    private String mediaState() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermissionState modern = getPermissionState(MEDIA_MODERN);
            if (modern == PermissionState.GRANTED) return "granted";
            if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
                getPermissionState(MEDIA_PARTIAL) == PermissionState.GRANTED
            ) {
                return "limited";
            }
            return modern.toString();
        }
        return getPermissionState(MEDIA_LEGACY).toString();
    }

    private boolean canRead() {
        String state = mediaState();
        return "granted".equals(state) || "limited".equals(state);
    }

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("media", mediaState());
        call.resolve(result);
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        requestPermissionForAliases(aliasesToRequest(), call, "mediaPermissionsCallback");
    }

    @PermissionCallback
    private void mediaPermissionsCallback(PluginCall call) {
        checkPermissions(call);
    }

    // ---- findMedia ---------------------------------------------------------

    @PluginMethod
    public void findMedia(PluginCall call) {
        final Double from = call.getDouble("from");
        final Double to = call.getDouble("to");
        if (from == null || to == null || to < from) {
            call.reject("from y to son obligatorios", "INVALID_RANGE");
            return;
        }
        if (!canRead()) {
            call.reject("Sin acceso a la galería", "PERMISSION_DENIED");
            return;
        }
        final boolean thumbnails = Boolean.TRUE.equals(call.getBoolean("thumbnails", true));
        final int limit = call.getInt("limit", DEFAULT_LIMIT);

        executor.execute(() -> {
            try {
                JSArray assets = new JSArray();
                int remaining = limit;
                remaining -= query(false, from.longValue(), to.longValue(), thumbnails, remaining, assets);
                if (remaining > 0) query(true, from.longValue(), to.longValue(), thumbnails, remaining, assets);
                JSObject result = new JSObject();
                result.put("assets", assets);
                call.resolve(result);
            } catch (Exception error) {
                Logger.error("GalleryScan", "findMedia failed", error);
                call.reject("No se pudo leer la galería", "SCAN_FAILED", error);
            }
        });
    }

    /** Appends matches of one media type and returns how many it added. */
    private int query(boolean video, long fromMs, long toMs, boolean thumbnails, int limit, JSArray out) {
        ContentResolver resolver = getContext().getContentResolver();
        Uri collection = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;

        List<String> projection = new ArrayList<>();
        projection.add(MediaStore.MediaColumns._ID);
        projection.add(MediaStore.MediaColumns.DATE_TAKEN);
        projection.add(MediaStore.MediaColumns.DATE_ADDED);
        projection.add(MediaStore.MediaColumns.WIDTH);
        projection.add(MediaStore.MediaColumns.HEIGHT);
        if (video) projection.add(MediaStore.Video.VideoColumns.DURATION);
        // Before Android 10 MediaStore exposed the GPS columns directly.
        boolean legacyGps = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q;
        if (legacyGps) {
            projection.add(video ? MediaStore.Video.VideoColumns.LATITUDE : MediaStore.Images.ImageColumns.LATITUDE);
            projection.add(video ? MediaStore.Video.VideoColumns.LONGITUDE : MediaStore.Images.ImageColumns.LONGITUDE);
        }

        // DATE_TAKEN is the capture time in ms; files without it (screenshots,
        // some imports) fall back to DATE_ADDED, which is in seconds.
        String selection =
            "(" + MediaStore.MediaColumns.DATE_TAKEN + " BETWEEN ? AND ?) OR (" +
            MediaStore.MediaColumns.DATE_TAKEN + " IS NULL AND " + MediaStore.MediaColumns.DATE_ADDED + " BETWEEN ? AND ?)";
        String[] args = {
            String.valueOf(fromMs),
            String.valueOf(toMs),
            String.valueOf(fromMs / 1000),
            String.valueOf(toMs / 1000)
        };
        String order = MediaStore.MediaColumns.DATE_TAKEN + " ASC";

        int added = 0;
        try (Cursor cursor = resolver.query(collection, projection.toArray(new String[0]), selection, args, order)) {
            if (cursor == null) return 0;
            int idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
            int takenCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_TAKEN);
            int addedCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED);
            int widthCol = cursor.getColumnIndex(MediaStore.MediaColumns.WIDTH);
            int heightCol = cursor.getColumnIndex(MediaStore.MediaColumns.HEIGHT);
            int durationCol = video ? cursor.getColumnIndex(MediaStore.Video.VideoColumns.DURATION) : -1;
            int latCol = legacyGps ? cursor.getColumnIndex(projection.get(projection.size() - 2)) : -1;
            int lngCol = legacyGps ? cursor.getColumnIndex(projection.get(projection.size() - 1)) : -1;

            while (cursor.moveToNext() && added < limit) {
                long id = cursor.getLong(idCol);
                long createdAt = cursor.isNull(takenCol) ? cursor.getLong(addedCol) * 1000L : cursor.getLong(takenCol);
                Uri uri = ContentUris.withAppendedId(collection, id);

                JSObject asset = new JSObject();
                asset.put("id", (video ? "video:" : "image:") + id);
                asset.put("kind", video ? "video" : "photo");
                asset.put("createdAt", createdAt);
                if (widthCol >= 0 && !cursor.isNull(widthCol)) asset.put("width", cursor.getInt(widthCol));
                if (heightCol >= 0 && !cursor.isNull(heightCol)) asset.put("height", cursor.getInt(heightCol));
                if (durationCol >= 0 && !cursor.isNull(durationCol)) asset.put("durationSec", cursor.getLong(durationCol) / 1000.0);

                double[] location = null;
                if (legacyGps && latCol >= 0 && lngCol >= 0 && !cursor.isNull(latCol) && !cursor.isNull(lngCol)) {
                    double lat = cursor.getDouble(latCol);
                    double lng = cursor.getDouble(lngCol);
                    if (lat != 0 || lng != 0) location = new double[] { lat, lng };
                } else if (!legacyGps) {
                    location = video ? readVideoLocation(uri) : readImageLocation(uri);
                }
                if (location != null) {
                    asset.put("lat", location[0]);
                    asset.put("lng", location[1]);
                }

                if (thumbnails) {
                    String thumb = thumbnail(resolver, uri, id, video);
                    if (thumb != null) asset.put("thumbnailPath", thumb);
                }
                out.put(asset);
                added++;
            }
        }
        return added;
    }

    /** EXIF GPS of a photo. Needs ACCESS_MEDIA_LOCATION or the tags come back redacted. */
    private double[] readImageLocation(Uri uri) {
        Uri source = uri;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState(MEDIA_LOCATION) == PermissionState.GRANTED) {
            source = MediaStore.setRequireOriginal(uri);
        }
        try (InputStream stream = getContext().getContentResolver().openInputStream(source)) {
            if (stream == null) return null;
            ExifInterface exif = new ExifInterface(stream);
            float[] latLng = new float[2];
            if (exif.getLatLong(latLng)) return new double[] { latLng[0], latLng[1] };
        } catch (Exception | OutOfMemoryError ignored) {
            // No EXIF, unsupported format or location redacted: the matcher
            // falls back to time plus the user's saved events.
        }
        return null;
    }

    /** Location atom of a video ("+40.4168-003.7038/"), when the camera wrote one. */
    private double[] readVideoLocation(Uri uri) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            Uri source = uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState(MEDIA_LOCATION) == PermissionState.GRANTED) {
                source = MediaStore.setRequireOriginal(uri);
            }
            retriever.setDataSource(getContext(), source);
            String value = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_LOCATION);
            if (value == null) return null;
            Matcher matcher = ISO6709.matcher(value);
            if (!matcher.find()) return null;
            double lat = Double.parseDouble(matcher.group(1));
            double lng = Double.parseDouble(matcher.group(2));
            if (lat == 0 && lng == 0) return null;
            return new double[] { lat, lng };
        } catch (Exception ignored) {
            return null;
        } finally {
            try {
                retriever.release();
            } catch (Exception ignored) {
                // release() declares IOException since API 29
            }
        }
    }

    /** Small JPEG in the cache dir, reused between scans. Returns a file:// URI. */
    private String thumbnail(ContentResolver resolver, Uri uri, long id, boolean video) {
        File dir = new File(getContext().getCacheDir(), "gallery-thumbs");
        if (!dir.exists() && !dir.mkdirs()) return null;
        File file = new File(dir, (video ? "v" : "i") + id + ".jpg");
        if (file.exists() && file.length() > 0) return Uri.fromFile(file).toString();

        Bitmap bitmap = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                bitmap = resolver.loadThumbnail(uri, new Size(THUMB_SIZE, THUMB_SIZE), null);
            } else if (video) {
                bitmap = MediaStore.Video.Thumbnails.getThumbnail(resolver, id, MediaStore.Video.Thumbnails.MINI_KIND, null);
            } else {
                bitmap = MediaStore.Images.Thumbnails.getThumbnail(resolver, id, MediaStore.Images.Thumbnails.MINI_KIND, null);
            }
            if (bitmap == null) return null;
            try (FileOutputStream stream = new FileOutputStream(file)) {
                bitmap.compress(Bitmap.CompressFormat.JPEG, 75, stream);
            }
            return Uri.fromFile(file).toString();
        } catch (Exception | OutOfMemoryError error) {
            Logger.debug("GalleryScan", "No thumbnail for " + uri);
            return null;
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }

    // ---- getUploadPath -----------------------------------------------------

    /**
     * The URI the upload queue reads. On Android the content:// URI is enough:
     * Capacitor.convertFileSrc serves it to the WebView without copying.
     */
    @PluginMethod
    public void getUploadPath(PluginCall call) {
        String id = call.getString("id");
        if (id == null || !id.contains(":")) {
            call.reject("id no válido", "INVALID_ID");
            return;
        }
        if (!canRead()) {
            call.reject("Sin acceso a la galería", "PERMISSION_DENIED");
            return;
        }
        String[] parts = id.split(":", 2);
        long numericId;
        try {
            numericId = Long.parseLong(parts[1]);
        } catch (NumberFormatException error) {
            call.reject("id no válido", "INVALID_ID");
            return;
        }
        Uri collection = "video".equals(parts[0])
            ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        JSObject result = new JSObject();
        result.put("path", ContentUris.withAppendedId(collection, numericId).toString());
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdown();
        super.handleOnDestroy();
    }
}

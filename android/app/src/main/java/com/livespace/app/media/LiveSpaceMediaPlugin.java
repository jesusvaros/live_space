package com.livespace.app.media;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * App-local plugin behind src/media/native: pick videos, compress them on the
 * device and upload byte ranges straight from disk. Registered in MainActivity.
 */
@CapacitorPlugin(name = "LiveSpaceMedia")
public class LiveSpaceMediaPlugin extends Plugin {
  private final ExecutorService ioExecutor = Executors.newFixedThreadPool(2);
  private VideoCompressor compressor;

  @Override
  public void load() {
    compressor = new VideoCompressor(getContext());
  }

  @PluginMethod
  public void pickVideos(PluginCall call) {
    int limit = Math.max(1, Math.min(call.getInt("limit", 10), 50));
    Intent intent;
    if (ActivityResultContracts.PickVisualMedia.isPhotoPickerAvailable(getContext())) {
      intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
      intent.setType("video/*");
      if (limit > 1) {
        int systemLimit = Build.VERSION.SDK_INT >= 33 ? MediaStore.getPickImagesMaxLimit() : limit;
        intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(limit, systemLimit));
      }
    } else {
      intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("video/*");
      intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, limit > 1);
    }
    startActivityForResult(call, intent, "pickVideosResult");
  }

  @ActivityCallback
  private void pickVideosResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    List<Uri> uris = new ArrayList<>();
    if (result.getResultCode() == Activity.RESULT_OK && data != null) {
      ClipData clip = data.getClipData();
      if (clip != null) {
        for (int index = 0; index < clip.getItemCount(); index += 1) uris.add(clip.getItemAt(index).getUri());
      } else if (data.getData() != null) {
        uris.add(data.getData());
      }
    }
    final int limit = Math.max(1, Math.min(call.getInt("limit", 10), 50));
    ioExecutor.execute(() -> {
      JSArray videos = new JSArray();
      for (Uri uri : uris) {
        if (videos.length() >= limit) break;
        try {
          // Keep access across restarts: the upload queue may compress later.
          getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {
          // Not every provider allows persisting the grant.
        }
        try {
          VideoMetadata metadata = VideoMetadata.read(getContext(), uri.toString());
          JSObject video = metadataToJs(metadata);
          video.put("path", uri.toString());
          videos.put(video);
        } catch (Exception ignored) {
          // Skip files the platform cannot read as video.
        }
      }
      JSObject response = new JSObject();
      response.put("videos", videos);
      call.resolve(response);
    });
  }

  @PluginMethod
  public void getVideoInfo(PluginCall call) {
    String path = call.getString("path");
    if (path == null || path.isEmpty()) {
      call.reject("path is required");
      return;
    }
    ioExecutor.execute(() -> {
      try {
        JSObject response = metadataToJs(VideoMetadata.read(getContext(), path));
        response.put("path", path);
        call.resolve(response);
      } catch (Exception error) {
        call.reject("No se pudo leer el vídeo.", error);
      }
    });
  }

  @PluginMethod
  public void compressVideo(PluginCall call) {
    String path = call.getString("path");
    if (path == null || path.isEmpty()) {
      call.reject("path is required");
      return;
    }
    VideoCompressor.Options options = new VideoCompressor.Options();
    options.maxDurationSeconds = clamp(call.getInt("maxDurationSeconds", options.maxDurationSeconds), 1, 600);
    options.maxLongSide = clamp(call.getInt("maxLongSide", options.maxLongSide), 160, 3840);
    options.maxShortSide = clamp(call.getInt("maxShortSide", options.maxShortSide), 120, 2160);
    options.videoBitrate = clamp(call.getInt("videoBitrate", options.videoBitrate), 250_000, 20_000_000);
    options.audioBitrate = clamp(call.getInt("audioBitrate", options.audioBitrate), 32_000, 320_000);
    final String taskId = call.getString("taskId", "");

    call.setKeepAlive(true);
    compressor.compress(path, options, new VideoCompressor.Callback() {
      @Override
      public void onProgress(int percent) {
        JSObject event = new JSObject();
        event.put("taskId", taskId);
        event.put("progress", percent / 100.0);
        notifyListeners("compressProgress", event);
      }

      @Override
      public void onSuccess(VideoCompressor.Result result) {
        JSObject response = new JSObject();
        response.put("path", result.path);
        response.put("thumbnailPath", result.thumbnailPath);
        response.put("sizeBytes", result.sizeBytes);
        response.put("durationSeconds", result.durationSeconds);
        response.put("width", result.width);
        response.put("height", result.height);
        response.put("trimmed", result.trimmed);
        response.put("contentType", "video/mp4");
        response.put("capturedAt", result.source.capturedAt);
        response.put("location", locationToJs(result.source));
        call.setKeepAlive(false);
        call.resolve(response);
      }

      @Override
      public void onError(String message, Exception error) {
        call.setKeepAlive(false);
        call.reject(message, error);
      }
    });
  }

  @PluginMethod
  public void uploadFileRange(PluginCall call) {
    String path = call.getString("path");
    String url = call.getString("url");
    // JS numbers arrive as Integer or Double, which PluginCall.getLong rejects.
    long offset = call.getData().optLong("offset", 0L);
    long length = call.getData().optLong("length", -1L);
    final String taskId = call.getString("taskId", "");
    if (path == null || url == null || offset < 0 || length <= 0) {
      call.reject("path, url, offset and length are required");
      return;
    }
    Map<String, String> headers = new HashMap<>();
    JSObject headerObject = call.getObject("headers", new JSObject());
    if (headerObject != null) {
      Iterator<String> keys = headerObject.keys();
      while (keys.hasNext()) {
        String key = keys.next();
        String value = headerObject.getString(key);
        if (value != null) headers.put(key, value);
      }
    }
    ioExecutor.execute(() -> {
      try {
        RangeUploader.Response response = RangeUploader.put(getContext(), path, url, offset, length, headers, (sent, total) -> {
          JSObject event = new JSObject();
          event.put("taskId", taskId);
          event.put("sentBytes", sent);
          event.put("totalBytes", total);
          notifyListeners("uploadProgress", event);
        });
        JSObject result = new JSObject();
        result.put("status", response.status);
        result.put("etag", response.etag);
        call.resolve(result);
      } catch (Exception error) {
        call.reject("network_error", "NETWORK", error);
      }
    });
  }

  @PluginMethod
  public void deleteFile(PluginCall call) {
    String path = call.getString("path");
    if (path == null) {
      call.reject("path is required");
      return;
    }
    File workDirectory = VideoCompressor.workDirectory(getContext());
    File file = new File(path.startsWith("file://") ? Uri.parse(path).getPath() : path);
    try {
      // Only files this plugin wrote may be deleted.
      if (file.getCanonicalPath().startsWith(workDirectory.getCanonicalPath() + File.separator)) {
        //noinspection ResultOfMethodCallIgnored
        file.delete();
      } else if (path.startsWith("content://")) {
        getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(path), Intent.FLAG_GRANT_READ_URI_PERMISSION);
      }
    } catch (Exception ignored) {
      // Best effort cleanup.
    }
    call.resolve();
  }

  @Override
  protected void handleOnDestroy() {
    ioExecutor.shutdown();
  }

  private static int clamp(Integer value, int min, int max) {
    int resolved = value == null ? min : value;
    return Math.max(min, Math.min(max, resolved));
  }

  private static JSObject metadataToJs(VideoMetadata metadata) {
    JSObject object = new JSObject();
    object.put("durationSeconds", metadata.durationMs / 1000.0);
    object.put("width", metadata.displayWidth());
    object.put("height", metadata.displayHeight());
    object.put("sizeBytes", metadata.sizeBytes);
    object.put("capturedAt", metadata.capturedAt);
    object.put("location", locationToJs(metadata));
    return object;
  }

  private static Object locationToJs(VideoMetadata metadata) {
    if (metadata.latitude == null || metadata.longitude == null) return JSObject.NULL;
    JSObject location = new JSObject();
    location.put("latitude", metadata.latitude);
    location.put("longitude", metadata.longitude);
    return location;
  }
}

package com.livespace.app.media;

import android.content.Context;
import android.net.Uri;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * PUTs a byte range of a local file to a presigned URL, streaming from disk so
 * large videos never cross the WebView bridge as base64.
 */
final class RangeUploader {
  interface ProgressListener {
    void onProgress(long sentBytes, long totalBytes);
  }

  static final class Response {
    int status;
    String etag;
  }

  private RangeUploader() {}

  static Response put(
    Context context,
    String path,
    String url,
    long offset,
    long length,
    Map<String, String> headers,
    ProgressListener listener
  ) throws IOException {
    if (!url.startsWith("https://")) throw new IOException("Only HTTPS upload URLs are allowed");
    Uri uri = VideoMetadata.toUri(path);
    HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
    connection.setRequestMethod("PUT");
    connection.setDoOutput(true);
    connection.setConnectTimeout(20_000);
    connection.setReadTimeout(60_000);
    connection.setFixedLengthStreamingMode(length);
    for (Map.Entry<String, String> header : headers.entrySet()) {
      String name = header.getKey();
      if ("content-length".equalsIgnoreCase(name) || "host".equalsIgnoreCase(name)) continue;
      connection.setRequestProperty(name, header.getValue());
    }

    try (InputStream input = open(context, uri); OutputStream output = connection.getOutputStream()) {
      long skipped = 0;
      while (skipped < offset) {
        long step = input.skip(offset - skipped);
        if (step <= 0) throw new IOException("Unable to seek in the upload file");
        skipped += step;
      }
      byte[] buffer = new byte[64 * 1024];
      long sent = 0;
      long lastReported = 0;
      while (sent < length) {
        int read = input.read(buffer, 0, (int) Math.min(buffer.length, length - sent));
        if (read < 0) throw new IOException("The upload file is shorter than expected");
        output.write(buffer, 0, read);
        sent += read;
        if (listener != null && (sent - lastReported >= 256 * 1024 || sent == length)) {
          lastReported = sent;
          listener.onProgress(sent, length);
        }
      }
      output.flush();
    }

    Response response = new Response();
    response.status = connection.getResponseCode();
    response.etag = connection.getHeaderField("ETag");
    try {
      InputStream body = response.status >= 400 ? connection.getErrorStream() : connection.getInputStream();
      if (body != null) body.close();
    } catch (IOException ignored) {
      // The status code is what matters.
    }
    connection.disconnect();
    return response;
  }

  private static InputStream open(Context context, Uri uri) throws IOException {
    InputStream stream = "file".equals(uri.getScheme())
      ? new java.io.FileInputStream(uri.getPath())
      : context.getContentResolver().openInputStream(uri);
    if (stream == null) throw new IOException("Unable to open the upload file");
    return stream;
  }
}

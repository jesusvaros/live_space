package com.livespace.app.media;

import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.media3.common.Effect;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Metadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.container.Mp4LocationData;
import androidx.media3.effect.Presentation;
import androidx.media3.muxer.BufferInfo;
import androidx.media3.muxer.Muxer;
import androidx.media3.muxer.MuxerException;
import androidx.media3.transformer.AudioEncoderSettings;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.InAppMp4Muxer;
import androidx.media3.transformer.ProgressHolder;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.VideoEncoderSettings;
import com.google.common.collect.ImmutableList;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Transcodes a picked video to the upload format: H.264 + AAC in MP4, at most
 * 720p, ~2.5 Mbps video and 128 kbps audio, trimmed to the first N seconds,
 * faststart, without GPS metadata. Runs Media3 Transformer on the main looper.
 */
final class VideoCompressor {
  interface Callback {
    void onProgress(int percent);

    void onSuccess(Result result);

    void onError(String message, Exception error);
  }

  static final class Options {
    int maxDurationSeconds = 45;
    int maxLongSide = 1280;
    int maxShortSide = 720;
    int videoBitrate = 2_500_000;
    int audioBitrate = 128_000;
  }

  static final class Result {
    String path;
    String thumbnailPath;
    long sizeBytes;
    double durationSeconds;
    int width;
    int height;
    boolean trimmed;
    VideoMetadata source;
  }

  private final Context context;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  VideoCompressor(Context context) {
    this.context = context.getApplicationContext();
  }

  static File workDirectory(Context context) {
    File directory = new File(context.getFilesDir(), "ls-uploads");
    if (!directory.exists()) {
      //noinspection ResultOfMethodCallIgnored
      directory.mkdirs();
    }
    return directory;
  }

  void compress(String inputPath, Options options, Callback callback) {
    final VideoMetadata source;
    try {
      source = VideoMetadata.read(context, inputPath);
    } catch (Exception error) {
      callback.onError("No se pudo leer el vídeo.", error);
      return;
    }
    if (source.durationMs <= 0 || source.width <= 0 || source.height <= 0) {
      callback.onError("El archivo no parece un vídeo válido.", null);
      return;
    }

    final long maxDurationMs = options.maxDurationSeconds * 1000L;
    final boolean trimmed = source.durationMs > maxDurationMs + 250;
    final File output = new File(workDirectory(context), UUID.randomUUID() + ".mp4");

    mainHandler.post(() -> {
      MediaItem.Builder itemBuilder = new MediaItem.Builder().setUri(VideoMetadata.toUri(inputPath));
      if (trimmed) {
        itemBuilder.setClippingConfiguration(
          new MediaItem.ClippingConfiguration.Builder().setStartPositionMs(0).setEndPositionMs(maxDurationMs).build()
        );
      }

      List<Effect> videoEffects = new ArrayList<>();
      int displayWidth = source.displayWidth();
      int displayHeight = source.displayHeight();
      int longSide = Math.max(displayWidth, displayHeight);
      int shortSide = Math.min(displayWidth, displayHeight);
      double scale = Math.min(1.0, Math.min(options.maxLongSide / (double) longSide, options.maxShortSide / (double) shortSide));
      if (scale < 1.0) {
        int targetWidth = even(displayWidth * scale);
        int targetHeight = even(displayHeight * scale);
        videoEffects.add(Presentation.createForWidthAndHeight(targetWidth, targetHeight, Presentation.LAYOUT_SCALE_TO_FIT));
      }

      EditedMediaItem editedItem = new EditedMediaItem.Builder(itemBuilder.build())
        .setEffects(new Effects(ImmutableList.of(), videoEffects))
        .build();

      DefaultEncoderFactory encoderFactory = new DefaultEncoderFactory.Builder(context)
        .setRequestedVideoEncoderSettings(new VideoEncoderSettings.Builder().setBitrate(options.videoBitrate).build())
        .setRequestedAudioEncoderSettings(new AudioEncoderSettings.Builder().setBitrate(options.audioBitrate).build())
        .setEnableFallback(true)
        .build();

      final Transformer[] holder = new Transformer[1];
      final ProgressHolder progressHolder = new ProgressHolder();
      final boolean[] finished = { false };
      final Runnable progressPoller = new Runnable() {
        @Override
        public void run() {
          if (finished[0] || holder[0] == null) return;
          if (holder[0].getProgress(progressHolder) == Transformer.PROGRESS_STATE_AVAILABLE) {
            callback.onProgress(progressHolder.progress);
          }
          mainHandler.postDelayed(this, 500);
        }
      };

      Transformer transformer = new Transformer.Builder(context)
        .setVideoMimeType(MimeTypes.VIDEO_H264)
        .setAudioMimeType(MimeTypes.AUDIO_AAC)
        .setEncoderFactory(encoderFactory)
        .setMuxerFactory(new StripLocationMuxerFactory(new InAppMp4Muxer.Factory().setAttemptStreamableOutputEnabled(true)))
        .addListener(new Transformer.Listener() {
          @Override
          public void onCompleted(@NonNull Composition composition, @NonNull ExportResult exportResult) {
            finished[0] = true;
            new Thread(() -> finish(output, source, trimmed, exportResult, callback)).start();
          }

          @Override
          public void onError(
            @NonNull Composition composition,
            @NonNull ExportResult exportResult,
            @NonNull ExportException exportException
          ) {
            finished[0] = true;
            //noinspection ResultOfMethodCallIgnored
            output.delete();
            callback.onError("No se pudo comprimir el vídeo.", exportException);
          }
        })
        .build();
      holder[0] = transformer;
      try {
        transformer.start(editedItem, output.getAbsolutePath());
        mainHandler.postDelayed(progressPoller, 500);
      } catch (Exception error) {
        finished[0] = true;
        callback.onError("No se pudo comprimir el vídeo.", error);
      }
    });
  }

  private void finish(File output, VideoMetadata source, boolean trimmed, ExportResult exportResult, Callback callback) {
    try {
      Mp4FastStart.apply(output);
      VideoMetadata produced = VideoMetadata.read(context, output.getAbsolutePath());
      Result result = new Result();
      result.path = output.getAbsolutePath();
      result.sizeBytes = output.length();
      result.durationSeconds = (produced.durationMs > 0 ? produced.durationMs : exportResult.durationMs) / 1000.0;
      result.width = produced.displayWidth();
      result.height = produced.displayHeight();
      result.trimmed = trimmed;
      result.source = source;
      result.thumbnailPath = writeThumbnail(output, produced.durationMs);
      callback.onSuccess(result);
    } catch (Exception error) {
      //noinspection ResultOfMethodCallIgnored
      output.delete();
      callback.onError("No se pudo preparar el vídeo comprimido.", error);
    }
  }

  /** A JPEG frame (max 720 px wide) the web layer uploads as the poster image. */
  String writeThumbnail(File video, long durationMs) {
    MediaMetadataRetriever retriever = new MediaMetadataRetriever();
    try {
      retriever.setDataSource(video.getAbsolutePath());
      long atUs = Math.min(1_000_000L, Math.max(0, durationMs * 500L));
      Bitmap frame = retriever.getFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
      if (frame == null) return null;
      Bitmap scaled = frame;
      if (frame.getWidth() > 720) {
        int height = Math.round(frame.getHeight() * (720f / frame.getWidth()));
        scaled = Bitmap.createScaledBitmap(frame, 720, height, true);
      }
      File thumbnail = new File(video.getParentFile(), video.getName().replace(".mp4", "") + ".jpg");
      try (FileOutputStream stream = new FileOutputStream(thumbnail)) {
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, stream);
      }
      if (scaled != frame) scaled.recycle();
      frame.recycle();
      return thumbnail.getAbsolutePath();
    } catch (Exception error) {
      return null;
    } finally {
      try {
        retriever.release();
      } catch (Exception ignored) {
        // Nothing to release.
      }
    }
  }

  private static int even(double value) {
    int rounded = (int) Math.round(value);
    return Math.max(2, rounded - (rounded % 2));
  }

  /** Drops GPS (and XMP, which can carry GPS) before it reaches the output file. */
  private static final class StripLocationMuxerFactory implements Muxer.Factory {
    private final Muxer.Factory delegate;

    StripLocationMuxerFactory(Muxer.Factory delegate) {
      this.delegate = delegate;
    }

    @Override
    public Muxer create(String path) throws MuxerException {
      Muxer muxer = delegate.create(path);
      return new Muxer() {
        @Override
        public int addTrack(Format format) throws MuxerException {
          return muxer.addTrack(format);
        }

        @Override
        public void writeSampleData(int trackId, ByteBuffer data, BufferInfo bufferInfo) throws MuxerException {
          muxer.writeSampleData(trackId, data, bufferInfo);
        }

        @Override
        public void addMetadataEntry(Metadata.Entry entry) {
          if (entry instanceof Mp4LocationData) return;
          if (entry.getClass().getSimpleName().contains("Xmp")) return;
          muxer.addMetadataEntry(entry);
        }

        @Override
        public void close() throws MuxerException {
          muxer.close();
        }
      };
    }

    @Override
    public ImmutableList<String> getSupportedSampleMimeTypes(int trackType) {
      return delegate.getSupportedSampleMimeTypes(trackType);
    }

    @Override
    public boolean supportsWritingNegativeTimestampsInEditList() {
      return delegate.supportsWritingNegativeTimestampsInEditList();
    }
  }
}

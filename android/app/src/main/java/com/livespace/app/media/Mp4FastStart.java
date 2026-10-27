package com.livespace.app.media;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.List;

/**
 * Moves the moov atom in front of mdat (the "faststart" layout) so a browser can
 * start playing a plain MP4 from R2 before the whole file has downloaded.
 *
 * Media3's in-app muxer already tries to reserve room for moov at the start of
 * the file; this pass is a safety net and does nothing when moov already comes
 * first. It handles 32-bit (stco) and 64-bit (co64) chunk offset tables.
 */
final class Mp4FastStart {
  private Mp4FastStart() {}

  private static final class Atom {
    final String type;
    final long offset;
    final long size;

    Atom(String type, long offset, long size) {
      this.type = type;
      this.offset = offset;
      this.size = size;
    }
  }

  /** Returns true when the file was rewritten, false when it already was faststart. */
  static boolean apply(File file) throws IOException {
    List<Atom> atoms = readTopLevelAtoms(file);
    Atom moov = null;
    Atom mdat = null;
    for (Atom atom : atoms) {
      if (moov == null && "moov".equals(atom.type)) moov = atom;
      if (mdat == null && "mdat".equals(atom.type)) mdat = atom;
    }
    if (moov == null || mdat == null) throw new IOException("MP4 without moov or mdat");
    if (moov.offset < mdat.offset) return false;
    if (moov.size > Integer.MAX_VALUE) throw new IOException("moov atom too large");

    ByteBuffer moovData = ByteBuffer.allocate((int) moov.size);
    try (FileChannel channel = new FileInputStream(file).getChannel()) {
      channel.position(moov.offset);
      while (moovData.hasRemaining()) {
        if (channel.read(moovData) < 0) throw new IOException("Truncated moov atom");
      }
    }
    moovData.flip();
    // Everything that sat between the start of the file and the old moov moves
    // forward by the size of moov.
    patchChunkOffsets(moovData, 8, moovData.limit(), moov.size);

    File temporary = new File(file.getParentFile(), file.getName() + ".faststart");
    try (
      FileChannel input = new FileInputStream(file).getChannel();
      FileChannel output = new FileOutputStream(temporary).getChannel()
    ) {
      boolean moovWritten = false;
      for (Atom atom : atoms) {
        if ("moov".equals(atom.type)) continue;
        if (!moovWritten && atom.offset >= mdat.offset) {
          moovData.position(0);
          while (moovData.hasRemaining()) output.write(moovData);
          moovWritten = true;
        }
        long transferred = 0;
        while (transferred < atom.size) {
          long count = input.transferTo(atom.offset + transferred, atom.size - transferred, output);
          if (count <= 0) throw new IOException("Unable to copy MP4 atom " + atom.type);
          transferred += count;
        }
      }
    }
    if (!temporary.renameTo(file)) {
      //noinspection ResultOfMethodCallIgnored
      temporary.delete();
      throw new IOException("Unable to replace MP4 with its faststart copy");
    }
    return true;
  }

  private static List<Atom> readTopLevelAtoms(File file) throws IOException {
    List<Atom> atoms = new ArrayList<>();
    try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
      long length = raf.length();
      long offset = 0;
      while (offset + 8 <= length) {
        raf.seek(offset);
        long size = raf.readInt() & 0xFFFFFFFFL;
        byte[] typeBytes = new byte[4];
        raf.readFully(typeBytes);
        String type = new String(typeBytes, "US-ASCII");
        if (size == 1) {
          size = raf.readLong();
        } else if (size == 0) {
          size = length - offset;
        }
        if (size < 8 || offset + size > length) throw new IOException("Malformed MP4 atom " + type);
        atoms.add(new Atom(type, offset, size));
        offset += size;
      }
    }
    return atoms;
  }

  private static final String[] CONTAINERS = { "moov", "trak", "mdia", "minf", "stbl", "edts" };

  private static boolean isContainer(String type) {
    for (String container : CONTAINERS) {
      if (container.equals(type)) return true;
    }
    return false;
  }

  private static void patchChunkOffsets(ByteBuffer buffer, int start, int end, long delta) throws IOException {
    int position = start;
    while (position + 8 <= end) {
      long size = buffer.getInt(position) & 0xFFFFFFFFL;
      String type = new String(new byte[] {
        buffer.get(position + 4), buffer.get(position + 5), buffer.get(position + 6), buffer.get(position + 7)
      }, "US-ASCII");
      int headerSize = 8;
      if (size == 1) {
        size = buffer.getLong(position + 8);
        headerSize = 16;
      }
      if (size < headerSize || position + size > end) throw new IOException("Malformed atom inside moov");
      int body = position + headerSize;
      if (isContainer(type)) {
        patchChunkOffsets(buffer, body, (int) (position + size), delta);
      } else if ("stco".equals(type)) {
        int entries = buffer.getInt(body + 4);
        for (int index = 0; index < entries; index += 1) {
          int entryPosition = body + 8 + index * 4;
          long value = (buffer.getInt(entryPosition) & 0xFFFFFFFFL) + delta;
          if (value > 0xFFFFFFFFL) throw new IOException("Chunk offset overflow");
          buffer.putInt(entryPosition, (int) value);
        }
      } else if ("co64".equals(type)) {
        int entries = buffer.getInt(body + 4);
        for (int index = 0; index < entries; index += 1) {
          int entryPosition = body + 8 + index * 8;
          buffer.putLong(entryPosition, buffer.getLong(entryPosition) + delta);
        }
      }
      position += (int) size;
    }
  }
}

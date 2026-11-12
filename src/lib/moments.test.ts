import { describe, expect, it } from 'vitest';
import { findMp4CreationSeconds } from './moments';

const MAC_EPOCH = 2082844800;

const box = (type: string, payload: Uint8Array) => {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set([...type].map(char => char.charCodeAt(0)), 4);
  out.set(payload, 8);
  return out;
};

const mvhd = (unixSeconds: number) => {
  const payload = new Uint8Array(100);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 0); // version 0
  view.setUint32(4, unixSeconds + MAC_EPOCH); // creation_time
  view.setUint32(8, unixSeconds + MAC_EPOCH); // modification_time
  return box('mvhd', payload);
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out.buffer;
};

const SHOW = Date.parse('2026-10-03T19:42:10Z') / 1000;

describe('findMp4CreationSeconds', () => {
  it('reads moov at the start of the file', () => {
    const file = concat(box('ftyp', new Uint8Array(16)), box('moov', mvhd(SHOW)), box('mdat', new Uint8Array(64)));
    expect(findMp4CreationSeconds(file)).toBe(SHOW + MAC_EPOCH);
  });

  it('reads moov from the tail slice of a phone video (starts mid-mdat)', () => {
    // The last 2 MB of a long video: video bytes, then moov. Not a box boundary at 0.
    const midMdat = new Uint8Array(333).fill(0x5a);
    const tail = concat(midMdat, box('moov', mvhd(SHOW)));
    expect(findMp4CreationSeconds(tail)).toBe(SHOW + MAC_EPOCH);
  });

  it('returns null when there is no mvhd', () => {
    expect(findMp4CreationSeconds(new Uint8Array(500).fill(7).buffer)).toBeNull();
  });
});

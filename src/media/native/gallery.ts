import { Capacitor, registerPlugin } from '@capacitor/core';

// Wrapper over the local GalleryScan plugin
// (android/app/src/main/java/com/livespace/app/gallery/GalleryScanPlugin.java and
// ios/App/App/GalleryScanPlugin.swift). It only reads the camera roll: nothing
// is uploaded at scan time. On the web every call is a no-op.

export type GalleryPermission = 'granted' | 'limited' | 'denied' | 'prompt' | 'prompt-with-rationale';

export type GalleryAsset = {
  // Opaque native id: PHAsset.localIdentifier on iOS, "video:123" on Android.
  id: string;
  kind: 'photo' | 'video';
  // ISO instant the photo was taken or the recording started.
  createdAt: string;
  durationSec: number | null;
  location: { lat: number; lng: number } | null;
  // URL the WebView can load (already passed through convertFileSrc).
  thumbnailUri: string | null;
  width: number | null;
  height: number | null;
};

export type FindMediaOptions = {
  from: Date | string;
  to: Date | string;
  // Drops assets whose GPS is farther than radiusM. Assets without GPS are
  // kept: most phones strip location from videos, and the matcher decides.
  near?: { lat: number; lng: number; radiusM: number };
  // Generate cached thumbnails (default true). The silent background check
  // only needs counts and turns them off.
  thumbnails?: boolean;
  limit?: number;
};

type NativeAsset = {
  id: string;
  kind: 'photo' | 'video';
  createdAt: number;
  durationSec?: number;
  lat?: number;
  lng?: number;
  thumbnailPath?: string;
  width?: number;
  height?: number;
};

type GalleryScanPlugin = {
  checkPermissions(): Promise<{ media: GalleryPermission }>;
  requestPermissions(): Promise<{ media: GalleryPermission }>;
  findMedia(options: { from: number; to: number; thumbnails: boolean; limit?: number }): Promise<{ assets: NativeAsset[] }>;
  getUploadPath(options: { id: string }): Promise<{ path: string }>;
};

const GalleryScan = registerPlugin<GalleryScanPlugin>('GalleryScan');

export const isGalleryScanAvailable = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('GalleryScan');

export const canReadGallery = (permission: GalleryPermission) =>
  permission === 'granted' || permission === 'limited';

export const checkGalleryPermission = async (): Promise<GalleryPermission> => {
  if (!isGalleryScanAvailable()) return 'denied';
  return (await GalleryScan.checkPermissions()).media;
};

// Shows the system dialog. Call it only from /subir/sugerido, after the
// pre-prompt has explained why.
export const requestGalleryPermission = async (): Promise<GalleryPermission> => {
  if (!isGalleryScanAvailable()) return 'denied';
  return (await GalleryScan.requestPermissions()).media;
};

const toMs = (value: Date | string) => (value instanceof Date ? value.getTime() : Date.parse(value));

const EARTH_RADIUS_M = 6_371_000;

export const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

const fromNative = (asset: NativeAsset): GalleryAsset => ({
  id: asset.id,
  kind: asset.kind,
  createdAt: new Date(asset.createdAt).toISOString(),
  durationSec: typeof asset.durationSec === 'number' ? asset.durationSec : null,
  location: typeof asset.lat === 'number' && typeof asset.lng === 'number' ? { lat: asset.lat, lng: asset.lng } : null,
  thumbnailUri: asset.thumbnailPath ? Capacitor.convertFileSrc(asset.thumbnailPath) : null,
  width: asset.width ?? null,
  height: asset.height ?? null,
});

// Photos and videos taken between `from` and `to`, oldest first. Requires
// 'granted' or 'limited' permission; never prompts.
export const findMedia = async (options: FindMediaOptions): Promise<GalleryAsset[]> => {
  if (!isGalleryScanAvailable()) return [];
  const from = toMs(options.from);
  const to = toMs(options.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];

  const { assets } = await GalleryScan.findMedia({
    from,
    to,
    thumbnails: options.thumbnails ?? true,
    limit: options.limit,
  });
  const mapped = assets.map(fromNative);
  const near = options.near;
  if (!near) return mapped;
  return mapped.filter(asset => !asset.location || distanceMeters(asset.location, near) <= near.radiusM);
};

// Native path of the original, for the upload queue: a content:// URI on
// Android, a file:// copy in tmp/ on iOS (exported, possibly from iCloud).
export const getUploadPath = async (id: string): Promise<string> => {
  if (!isGalleryScanAvailable()) throw new Error('La galería solo está disponible en la app.');
  return (await GalleryScan.getUploadPath({ id })).path;
};

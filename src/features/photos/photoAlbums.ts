import type { TimelineMoment } from '../moments/concertTimeline';
import { clipKindOf } from '../moments/concertTimeline';

// The concert's photos as albums, one per person, plus «Todas». Pure (no
// React, no Supabase) so the page and the tests share the same rules.

export type PhotoAlbum = {
  // 'all' or the author's profile id.
  id: string;
  label: string;
  avatarUrl: string | null;
  isMe: boolean;
  photos: TimelineMoment[];
};

export const ALL_ALBUM_ID = 'all';

const timeOf = (moment: TimelineMoment) => {
  const value = new Date(moment.capturedAt || moment.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
};

/** Photos only: uploads of kind image (imported clips and videos stay out). */
export const concertPhotos = (moments: readonly TimelineMoment[]): TimelineMoment[] =>
  moments
    .filter(moment => clipKindOf(moment) === 'photo')
    .sort((left, right) => timeOf(left) - timeOf(right) || left.id.localeCompare(right.id));

/**
 * One album per author, in concert order inside each. Yours first, then the
 * biggest albums, then by name. «Todas» goes first when there are photos.
 */
export const groupPhotoAlbums = (
  moments: readonly TimelineMoment[],
  currentUserId: string | null,
): PhotoAlbum[] => {
  const photos = concertPhotos(moments);
  if (photos.length === 0) return [];
  const byUser = new Map<string, PhotoAlbum>();
  for (const photo of photos) {
    let album = byUser.get(photo.userId);
    if (!album) {
      const isMe = Boolean(currentUserId && photo.userId === currentUserId);
      album = {
        id: photo.userId,
        label: isMe ? 'Tus fotos' : `@${photo.userName || 'anónimo'}`,
        avatarUrl: photo.avatarUrl ?? null,
        isMe,
        photos: [],
      };
      byUser.set(photo.userId, album);
    }
    album.photos.push(photo);
  }
  const albums = [...byUser.values()].sort((left, right) =>
    Number(right.isMe) - Number(left.isMe)
    || right.photos.length - left.photos.length
    || left.label.localeCompare(right.label, 'es'));
  return [
    { id: ALL_ALBUM_ID, label: 'Todas', avatarUrl: null, isMe: false, photos },
    ...albums,
  ];
};

/** Leaves out what this viewer hid (hidden_posts). */
export const withoutHidden = <T>(items: readonly T[], hidden: ReadonlySet<string>, idOf: (item: T) => string): T[] => {
  if (hidden.size === 0) return items as T[];
  return items.filter(item => !hidden.has(idOf(item)));
};

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

/**
 * A resized copy of a Cloudinary image (never wider than `width`, auto
 * format and quality). Other URLs come back unchanged.
 */
export const cloudinaryResized = (url: string, width: number) => {
  const match = CLOUDINARY_UPLOAD.exec(url);
  if (!match) return url;
  return `${match[1]}w_${Math.round(width)},c_limit,q_auto,f_auto/${match[2]}`;
};

/**
 * Grid thumbnail: a small copy of the photo, else its stored thumbnail (a
 * video only ever shows its poster).
 */
export const photoThumbUrl = (
  moment: Pick<TimelineMoment, 'mediaUrl' | 'thumbnailUrl'> & { mediaType?: TimelineMoment['mediaType'] },
  width = 360,
) => {
  if (moment.mediaType === 'video') return moment.thumbnailUrl ? cloudinaryResized(moment.thumbnailUrl, width) : '';
  return CLOUDINARY_UPLOAD.test(moment.mediaUrl)
    ? cloudinaryResized(moment.mediaUrl, width)
    : moment.thumbnailUrl || moment.mediaUrl;
};

/** Full-screen copy: screen-sized, not the original upload. */
export const photoFullUrl = (moment: Pick<TimelineMoment, 'mediaUrl'>, width = 1600) =>
  cloudinaryResized(moment.mediaUrl, width);

/** "@lucia · 23:39" */
export const photoCredit = (moment: Pick<TimelineMoment, 'userName' | 'capturedAt' | 'createdAt'>) => {
  const time = new Date(moment.capturedAt || moment.createdAt);
  const clock = Number.isNaN(time.getTime())
    ? ''
    : time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return [`@${moment.userName || 'anónimo'}`, clock].filter(Boolean).join(' · ');
};

/** Indexes of the slides kept mounted around the current one. */
export const neighbourIndexes = (index: number, count: number, radius = 1) => {
  const result: number[] = [];
  for (let i = Math.max(0, index - radius); i <= Math.min(count - 1, index + radius); i += 1) result.push(i);
  return result;
};

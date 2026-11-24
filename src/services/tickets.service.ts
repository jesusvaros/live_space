import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../api';

// «Tu entrada»: the fan's own ticket for an upcoming concert, in the private
// «tickets» bucket (tickets/<user>/<event>/<file>). Only the owner can read it
// (see migration 20261124000100_ticket_vault.sql). Images are kept in the
// device cache after the first look, so they open at the door without signal.

const BUCKET = 'tickets';
const CACHE = 'live-space-tickets';
const cacheKey = (path: string) => `https://tickets.livespace.local/${path}`;
const KEEP_AFTER_START_MS = 12 * 60 * 60 * 1000;

export type TicketFile = { path: string; isPdf: boolean };
export type TicketEvent = { id: string; name: string; startsAt: string };

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export const ticketAccept = Object.keys(EXTENSIONS).join(',');
export const isTicketFileOk = (file: Pick<File, 'type' | 'size'>) => Boolean(EXTENSIONS[file.type]) && file.size <= 10 * 1024 * 1024;

const openCache = async () => {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE);
  } catch {
    return null;
  }
};

const listFolder = async (folder: string) => {
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 20 });
  if (error) throw error;
  return (data || []).filter(entry => entry.name && !entry.name.startsWith('.'));
};

export const ticketsService = {
  async list(userId: string, eventId: string): Promise<TicketFile[]> {
    const files = await listFolder(`${userId}/${eventId}`);
    return files
      .filter(file => file.id)
      .map(file => ({ path: `${userId}/${eventId}/${file.name}`, isPdf: file.name.endsWith('.pdf') }));
  },

  async upload(userId: string, eventId: string, file: File): Promise<TicketFile> {
    if (!isTicketFileOk(file)) throw new Error('Sube una foto o un PDF de menos de 10 MB.');
    const extension = EXTENSIONS[file.type];
    const path = `${userId}/${eventId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error('No se ha podido guardar la entrada. Prueba otra vez.');
    const cache = await openCache();
    if (cache && extension !== 'pdf') await cache.put(cacheKey(path), new Response(file)).catch(() => undefined);
    return { path, isPdf: extension === 'pdf' };
  },

  /** An object URL for an image ticket: from the device cache first, else downloaded and cached. */
  async imageUrl(path: string): Promise<string> {
    const cache = await openCache();
    const cached = await cache?.match(cacheKey(path)).catch(() => undefined);
    if (cached) return URL.createObjectURL(await cached.blob());
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error('No se ha podido abrir la entrada. Revisa tu conexión.');
    if (cache) await cache.put(cacheKey(path), new Response(data)).catch(() => undefined);
    return URL.createObjectURL(data);
  },

  /** PDFs open in the system viewer through a short-lived private link. */
  async openPdf(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 10 * 60);
    if (error || !data?.signedUrl) throw new Error('No se ha podido abrir la entrada. Revisa tu conexión.');
    if (Capacitor.isNativePlatform()) await Browser.open({ url: data.signedUrl });
    else window.open(data.signedUrl, '_blank', 'noopener');
  },

  async remove(path: string) {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw new Error('No se ha podido borrar la entrada.');
    const cache = await openCache();
    await cache?.delete(cacheKey(path)).catch(() => undefined);
  },

  /**
   * Upcoming concerts the user has a ticket for. Tickets of concerts already
   * over are deleted on the way: they are only kept until the night is done.
   */
  async upcoming(userId: string, now = Date.now()): Promise<TicketEvent[]> {
    const folders = (await listFolder(userId)).filter(entry => !entry.id).map(entry => entry.name);
    if (folders.length === 0) return [];
    const { data, error } = await supabase.from('events').select('id,name,starts_at').in('id', folders).eq('status', 'published');
    if (error) throw error;
    const events = (data || []) as { id: string; name: string; starts_at: string }[];
    const over = events.filter(event => Date.parse(event.starts_at) + KEEP_AFTER_START_MS < now);
    for (const event of over) {
      const files = await ticketsService.list(userId, event.id).catch(() => []);
      for (const file of files) await ticketsService.remove(file.path).catch(() => undefined);
    }
    return events
      .filter(event => !over.includes(event))
      .map(event => ({ id: event.id, name: event.name, startsAt: event.starts_at }))
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  },
};

import React, { useRef, useState } from 'react';
import { IconCamera, IconMap, IconMic } from '../../components/icons';
import { SocialIcon } from '../../components/artist/ArtistHero';
import { STYLES } from '../../pipeline/genres';
import { BIO_MAX, LINK_KEYS, LINK_LABELS, type LinkKey, cleanLinks, parseCapacity } from './profileForm';

// «Mi perfil»: what fans see of an artist or venue, editable by its team.
// Photo, then a few fields; links as one row each with the brand icon.
// Square photo for both kinds (the icon chip tells artist from venue).

export type ProfileDraft = {
  photoUrl: string | null;
  city: string;
  bio: string;
  genres: string[];
  links: Partial<Record<LinkKey, string>>;
  address: string;
  capacity: string;
  website: string;
};

export type ProfileSave = {
  city: string | null;
  bio?: string | null;
  genres?: string[];
  links?: Record<string, string>;
  address?: string | null;
  capacity?: number | null;
  website?: string | null;
};

type Props = {
  kind: 'artist' | 'venue';
  name: string;
  initial: ProfileDraft;
  readOnly?: boolean;
  onUploadPhoto: (file: File) => Promise<string>;
  onSave: (values: ProfileSave) => Promise<void>;
};

const MAX_GENRES = 3;

const field =
  'min-h-12 w-full rounded-xl border border-app-line bg-app-surface px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-ink/60 focus:outline-none disabled:opacity-60';

const Label: React.FC<{ children: React.ReactNode; htmlFor?: string; aside?: React.ReactNode }> = ({ children, htmlFor, aside }) => (
  <div className="mb-1.5 mt-6 flex items-baseline justify-between">
    <label htmlFor={htmlFor} className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">
      {children}
    </label>
    {aside}
  </div>
);

const ProfileEditor: React.FC<Props> = ({ kind, name, initial, readOnly = false, onUploadPhoto, onSave }) => {
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  // What is already saved: the photo saves on upload, the rest on «Guardar».
  const [baseline, setBaseline] = useState<ProfileDraft>(initial);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setMessage(null);
    setDraft(current => ({ ...current, [key]: value }));
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setMessage(null);
    try {
      const url = await onUploadPhoto(file);
      setDraft(current => ({ ...current, photoUrl: url }));
      setBaseline(current => ({ ...current, photoUrl: url }));
      setMessage({ kind: 'ok', text: 'Foto actualizada' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se ha podido subir la foto.' });
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const toggleGenre = (genre: string) => {
    const has = draft.genres.includes(genre);
    if (!has && draft.genres.length >= MAX_GENRES) return;
    set('genres', has ? draft.genres.filter(item => item !== genre) : [...draft.genres, genre]);
  };

  const save = async () => {
    setMessage(null);
    let values: ProfileSave = { city: draft.city.trim() || null };
    if (kind === 'artist') {
      const { links, invalid } = cleanLinks(draft.links);
      if (invalid) {
        setMessage({ kind: 'error', text: `Revisa el enlace de ${LINK_LABELS[invalid]}.` });
        return;
      }
      values = { ...values, bio: draft.bio.trim() || null, genres: draft.genres, links };
    } else {
      const capacity = parseCapacity(draft.capacity);
      if (capacity === undefined) {
        setMessage({ kind: 'error', text: 'El aforo tiene que ser un número.' });
        return;
      }
      const { links, invalid } = cleanLinks({ website: draft.website });
      if (invalid) {
        setMessage({ kind: 'error', text: 'Revisa la web.' });
        return;
      }
      values = { ...values, address: draft.address.trim() || null, capacity, website: links.website ?? null };
    }
    setSaving(true);
    try {
      await onSave(values);
      setBaseline(draft);
      setMessage({ kind: 'ok', text: 'Guardado' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se ha podido guardar.' });
    } finally {
      setSaving(false);
    }
  };

  const saveBar = readOnly ? (
    <p className="text-center text-[13px] text-white/55">Tu rol puede ver el perfil, no editarlo.</p>
  ) : (
    <div className="flex items-center gap-3">
      <p
        role="status"
        className={`min-w-0 flex-1 truncate text-[13px] ${message?.kind === 'error' ? 'text-rose-300' : 'text-white/60'}`}
      >
        {message?.text ?? (dirty ? 'Cambios sin guardar' : '')}
      </p>
      <button
        type="button"
        onClick={save}
        disabled={saving || photoBusy || !dirty}
        className="min-h-12 shrink-0 rounded-full bg-app-ink px-6 text-[15px] font-bold text-app-bg disabled:opacity-40"
      >
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-4 pt-2">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-app-line bg-app-surface">
          {draft.photoUrl ? (
            <img src={draft.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-poster text-3xl text-white/40">
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-white/55">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-app-line" aria-hidden>
              {kind === 'artist' ? <IconMic size={13} /> : <IconMap size={13} />}
            </span>
            <span className="truncate font-display text-lg font-bold text-app-ink">{name}</span>
          </p>
          {!readOnly ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                onChange={event => pickPhoto(event.target.files?.[0])}
              />
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => fileInput.current?.click()}
                className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full border border-app-line px-3.5 text-[13px] font-semibold text-app-ink disabled:opacity-50"
              >
                <IconCamera size={16} />
                {photoBusy ? 'Subiendo…' : draft.photoUrl ? 'Cambiar foto' : 'Añadir foto'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <Label htmlFor="perfil-ciudad">Ciudad</Label>
      <input
        id="perfil-ciudad"
        className={field}
        value={draft.city}
        disabled={readOnly}
        onChange={event => set('city', event.target.value)}
        autoComplete="address-level2"
      />

      {kind === 'artist' ? (
        <>
          <Label htmlFor="perfil-bio" aside={<span className="font-mono text-[11px] text-white/40">{draft.bio.length}/{BIO_MAX}</span>}>
            Bio
          </Label>
          <textarea
            id="perfil-bio"
            className={`${field} min-h-28 py-3 leading-snug`}
            maxLength={BIO_MAX}
            value={draft.bio}
            disabled={readOnly}
            placeholder="Una o dos frases"
            onChange={event => set('bio', event.target.value)}
          />

          <Label aside={<span className="font-mono text-[11px] text-white/40">{draft.genres.length}/{MAX_GENRES}</span>}>Estilo</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Estilo">
            {STYLES.map(genre => {
              const active = draft.genres.includes(genre);
              const full = !active && draft.genres.length >= MAX_GENRES;
              return (
                <button
                  key={genre}
                  type="button"
                  aria-pressed={active}
                  disabled={readOnly || full}
                  onClick={() => toggleGenre(genre)}
                  className={`min-h-10 rounded-full border px-3.5 text-[13px] font-semibold disabled:opacity-35 ${
                    active ? 'border-app-ink bg-app-ink text-app-bg' : 'border-app-line text-app-ink/85'
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>

          <Label>Enlaces</Label>
          <div className="flex flex-col gap-2">
            {LINK_KEYS.map(key => (
              <label
                key={key}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-app-line bg-app-surface pl-3.5 pr-2 focus-within:border-app-ink/60"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center text-white/70" aria-hidden>
                  <SocialIcon name={key} size={18} />
                </span>
                <span className="sr-only">{LINK_LABELS[key]}</span>
                <input
                  className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-app-ink placeholder:text-white/30 focus:outline-none"
                  value={draft.links[key] ?? ''}
                  disabled={readOnly}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder={key === 'instagram' || key === 'tiktok' ? '@usuario' : LINK_LABELS[key]}
                  onChange={event => set('links', { ...draft.links, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <Label htmlFor="perfil-direccion">Dirección</Label>
          <input
            id="perfil-direccion"
            className={field}
            value={draft.address}
            disabled={readOnly}
            onChange={event => set('address', event.target.value)}
            autoComplete="street-address"
          />
          <Label htmlFor="perfil-aforo">Aforo</Label>
          <input
            id="perfil-aforo"
            className={field}
            value={draft.capacity}
            disabled={readOnly}
            inputMode="numeric"
            placeholder="Personas"
            onChange={event => set('capacity', event.target.value)}
          />
          <Label htmlFor="perfil-web">Web</Label>
          <input
            id="perfil-web"
            className={field}
            value={draft.website}
            disabled={readOnly}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="sala.com"
            onChange={event => set('website', event.target.value)}
          />
        </>
      )}

      {/* Pinned to the bottom of the scrolling page, always in reach. */}
      <div className="sticky bottom-0 -mx-4 mt-8 border-t border-app-line bg-app-bg/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
        {saveBar}
      </div>
    </>
  );
};

export default ProfileEditor;

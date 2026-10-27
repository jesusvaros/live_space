import React, { useRef, useState } from 'react';
import Button from '../ui/Button';
import GeneratedPoster from '../ui/GeneratedPoster';
import { Spinner } from '../ui/AppPrimitives';
import { parseDatetimeLocalValue, toDatetimeLocalValue } from '../../lib/moments';
import { createConfiguredCloudinaryMediaProvider } from '../../media';
import { eventManagementService, ManagedEvent } from '../../services/eventManagement.service';

type EventEditFormProps = {
  event: ManagedEvent;
  subjectId: string;
  onSaved: () => void;
};

const fieldClass =
  'min-h-12 w-full rounded-xl border border-app-line bg-app-bg px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none';

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

// Name, time, ticket link and poster of one event. Whatever is saved here is
// locked against the scraper (events.manager_locked_fields).
const EventEditForm: React.FC<EventEditFormProps> = ({ event, subjectId, onSaved }) => {
  const [name, setName] = useState(event.name);
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(new Date(event.starts_at)));
  const [ticketUrl, setTicketUrl] = useState(event.ticket_url || '');
  const [imageUrl, setImageUrl] = useState(event.image_url || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const uploadCover = async (file: File) => {
    setUploading(true);
    setMessage(null);
    try {
      const provider = createConfiguredCloudinaryMediaProvider();
      const result = await provider.upload({ file, kind: 'image', subjectId, purpose: 'catalog' });
      setImageUrl(result.secureUrl);
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message || 'No se ha podido subir el cartel.' });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setMessage(null);
    const trimmedName = name.trim();
    const starts = parseDatetimeLocalValue(startsAt);
    const ticket = ticketUrl.trim();
    if (trimmedName.length < 2) return setMessage({ kind: 'error', text: 'El nombre es demasiado corto.' });
    if (!starts) return setMessage({ kind: 'error', text: 'Revisa la fecha y la hora.' });
    if (ticket && !isHttpUrl(ticket)) return setMessage({ kind: 'error', text: 'El enlace de entradas tiene que empezar por https://' });

    const updates: Parameters<typeof eventManagementService.updateEvent>[1] = {};
    if (trimmedName !== event.name) updates.name = trimmedName;
    if (starts.getTime() !== new Date(event.starts_at).getTime()) updates.starts_at = starts.toISOString();
    if ((ticket || null) !== (event.ticket_url || null)) updates.ticket_url = ticket || null;
    if ((imageUrl || null) !== (event.image_url || null)) updates.image_url = imageUrl || null;
    if (event.ends_at && updates.starts_at && new Date(event.ends_at) <= starts) {
      return setMessage({ kind: 'error', text: 'La hora de inicio queda después del final del evento.' });
    }
    if (!Object.keys(updates).length) return setMessage({ kind: 'ok', text: 'No hay cambios.' });

    setSaving(true);
    try {
      await eventManagementService.updateEvent(event.id, updates);
      setMessage({ kind: 'ok', text: 'Guardado. El scraper ya no cambiará estos datos.' });
      onSaved();
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message || 'No se ha podido guardar.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-3 px-3 pb-4 pt-3"
      onSubmit={formEvent => {
        formEvent.preventDefault();
        save();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Nombre</span>
        <input className={fieldClass} value={name} onChange={e => setName(e.target.value)} maxLength={160} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Día y hora</span>
        <input type="datetime-local" className={fieldClass} value={startsAt} onChange={e => setStartsAt(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Enlace de entradas</span>
        <input
          type="url"
          inputMode="url"
          className={fieldClass}
          value={ticketUrl}
          onChange={e => setTicketUrl(e.target.value)}
          placeholder="https://"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Cartel</span>
        <div className="flex items-center gap-3">
          <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-app-bg ring-1 ring-app-line">
            {imageUrl ? <img src={imageUrl} alt="Cartel" className="h-full w-full object-cover" /> : <GeneratedPoster title={event.name} variant="thumb" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) uploadCover(file);
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner className="h-4 w-4" /> : null}
              {imageUrl ? 'Cambiar' : 'Subir cartel'}
            </Button>
            {imageUrl ? (
              <Button variant="ghost" size="sm" onClick={() => setImageUrl('')}>
                Quitar
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'ok' ? 'text-emerald-400' : 'text-rose-300'}`}>
          {message.text}
        </p>
      ) : (
        <p className="text-[13px] text-white/55">Lo que cambies aquí manda sobre lo que publique la web de origen.</p>
      )}

      <Button type="submit" block disabled={saving || uploading}>
        {saving ? <Spinner className="h-4 w-4" /> : null}
        Guardar cambios
      </Button>
    </form>
  );
};

export default EventEditForm;

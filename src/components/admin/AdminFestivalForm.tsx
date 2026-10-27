import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../api';
import Button from '../ui/Button';
import { normalizeForMatching } from '../../normalize/normalizeText';

const fieldClass =
  'min-h-12 w-full rounded-xl border border-app-line bg-app-surface px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none';

type VenueOption = { id: string; name: string; city: string };

const optionalUrl = (value: string) => {
  const text = value.trim();
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
};

// Admins open a festival edition; its organisers then claim it and write the
// timetable. The grounds are an existing venue or a new one created here.
const AdminFestivalForm: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [city, setCity] = useState('');
  const [grounds, setGrounds] = useState('');
  const [groundsMatches, setGroundsMatches] = useState<VenueOption[]>([]);
  const [groundsVenue, setGroundsVenue] = useState<VenueOption | null>(null);
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const query = grounds.trim();
    if (groundsVenue || query.length < 2) {
      setGroundsMatches([]);
      return undefined;
    }
    const handle = window.setTimeout(async () => {
      const { data } = await supabase.from('venue_places').select('id,name,city').ilike('name', `%${query}%`).limit(6);
      setGroundsMatches((data || []) as VenueOption[]);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [grounds, groundsVenue]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!name.trim() || !startsOn || !endsOn || !city.trim() || !grounds.trim()) {
      setError('Nombre, fechas, ciudad y recinto son obligatorios.');
      return;
    }
    if (endsOn < startsOn) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      let venueId = groundsVenue?.id ?? null;
      if (!venueId) {
        const { data: venue, error: venueError } = await supabase
          .from('venue_places')
          .insert({
            name: grounds.trim(),
            normalized_name: normalizeForMatching(grounds),
            city: city.trim(),
            venue_type: 'festival',
            website_url: optionalUrl(website),
            status: 'published',
            created_by: auth.user?.id ?? null,
          })
          .select('id')
          .single();
        if (venueError) throw venueError;
        venueId = venue.id;
      }

      const editionYear = Number(year);
      const { data: festival, error: festivalError } = await supabase
        .from('festivals')
        .insert({
          name: name.trim(),
          normalized_name: normalizeForMatching(name),
          edition_year: Number.isInteger(editionYear) ? editionYear : null,
          starts_on: startsOn,
          ends_on: endsOn,
          city: city.trim(),
          venue_place_id: venueId,
          website_url: optionalUrl(website),
          instagram_url: optionalUrl(instagram),
          image_url: optionalUrl(imageUrl),
          description: description.trim() || null,
          created_by: auth.user?.id ?? null,
        })
        .select('id')
        .single();
      if (festivalError) throw festivalError;
      navigate(`/tabs/festival/${festival.id}`);
    } catch (err: any) {
      setError(
        err?.code === '23505'
          ? 'Ya existe ese festival para ese año.'
          : err?.message || 'No se ha podido crear el festival.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-4">
      <h2 className="font-display text-xl font-bold text-app-ink">Nuevo festival</h2>
      <input className={fieldClass} placeholder="Nombre (Ufovision)" value={name} onChange={event => setName(event.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <input className={fieldClass} inputMode="numeric" placeholder="Año" value={year} onChange={event => setYear(event.target.value)} />
        <input className={fieldClass} type="date" aria-label="Empieza" value={startsOn} onChange={event => setStartsOn(event.target.value)} />
        <input className={fieldClass} type="date" aria-label="Termina" value={endsOn} onChange={event => setEndsOn(event.target.value)} />
      </div>
      <input className={fieldClass} placeholder="Ciudad o municipio" value={city} onChange={event => setCity(event.target.value)} />
      <div className="relative">
        <input
          className={fieldClass}
          placeholder="Recinto (sala existente o uno nuevo)"
          value={groundsVenue ? `${groundsVenue.name} · ${groundsVenue.city}` : grounds}
          onChange={event => {
            setGroundsVenue(null);
            setGrounds(event.target.value);
          }}
        />
        {groundsMatches.length > 0 ? (
          <ul className="mt-1 overflow-hidden rounded-xl border border-app-line bg-app-surface">
            {groundsMatches.map(venue => (
              <li key={venue.id}>
                <button
                  type="button"
                  className="min-h-11 w-full px-3.5 text-left text-sm text-app-ink"
                  onClick={() => {
                    setGroundsVenue(venue);
                    setGrounds(venue.name);
                    setGroundsMatches([]);
                  }}
                >
                  {venue.name} · {venue.city}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="pt-1 text-xs text-white/50">
          {groundsVenue ? 'Se usará esta sala como recinto.' : 'Si no eliges una sala, se crea un recinto nuevo con este nombre.'}
        </p>
      </div>
      <input className={fieldClass} placeholder="Web" value={website} onChange={event => setWebsite(event.target.value)} />
      <input className={fieldClass} placeholder="Instagram (enlace)" value={instagram} onChange={event => setInstagram(event.target.value)} />
      <input className={fieldClass} placeholder="Cartel (URL de la imagen, opcional)" value={imageUrl} onChange={event => setImageUrl(event.target.value)} />
      <textarea
        className={`${fieldClass} min-h-24 py-3`}
        placeholder="Descripción corta (opcional)"
        value={description}
        onChange={event => setDescription(event.target.value)}
      />
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <Button type="submit" disabled={saving}>
        {saving ? 'Creando…' : 'Crear festival'}
      </Button>
    </form>
  );
};

export default AdminFestivalForm;

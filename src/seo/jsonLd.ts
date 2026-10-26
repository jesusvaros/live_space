// schema.org builders for the prerendered public site. Google requires
// name, startDate and location.address for Event; everything else is added
// only when the catalogue actually has it.

export type SeoVenue = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
};

export type SeoArtist = { id: string; name: string; genres: string[] };

export type SeoEvent = {
  id: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  ticket_url: string | null;
  price_tiers: Array<{ label?: string; price: number }>;
  is_free: boolean;
  status: string;
  venue: SeoVenue;
  artists: SeoArtist[];
};

const TIME_ZONE = 'Europe/Madrid';

// ISO 8601 with the Madrid offset ("2026-11-14T21:00:00+01:00"), which
// Google prefers over UTC so the local time is unambiguous.
export const madridIso = (value: string): string => {
  const date = new Date(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', '');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
};

export const placeJsonLd = (venue: SeoVenue, url?: string) => ({
  '@type': 'MusicVenue',
  name: venue.name,
  ...(url ? { url } : {}),
  address: {
    '@type': 'PostalAddress',
    ...(venue.address ? { streetAddress: venue.address } : {}),
    ...(venue.postal_code ? { postalCode: venue.postal_code } : {}),
    addressLocality: venue.city,
    addressCountry: 'ES',
  },
  ...(venue.latitude !== null && venue.longitude !== null
    ? { geo: { '@type': 'GeoCoordinates', latitude: Number(venue.latitude), longitude: Number(venue.longitude) } }
    : {}),
  ...(venue.website_url ? { sameAs: [venue.website_url] } : {}),
});

export const eventJsonLd = (
  event: SeoEvent,
  urls: { event: string; venue?: string; artist: (artist: SeoArtist) => string | undefined },
) => {
  const lowestPrice = event.price_tiers.length > 0 ? Math.min(...event.price_tiers.map((tier) => tier.price)) : null;
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: event.name,
    url: urls.event,
    startDate: madridIso(event.starts_at),
    ...(event.ends_at ? { endDate: madridIso(event.ends_at) } : {}),
    eventStatus:
      event.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: placeJsonLd(event.venue, urls.venue),
    ...(event.description ? { description: event.description.slice(0, 500) } : {}),
    ...(event.artists.length > 0
      ? {
          performer: event.artists.map((artist) => ({
            '@type': 'MusicGroup',
            name: artist.name,
            ...(urls.artist(artist) ? { url: urls.artist(artist) } : {}),
          })),
        }
      : {}),
    ...(event.ticket_url || event.is_free || lowestPrice !== null
      ? {
          offers: {
            '@type': 'Offer',
            ...(event.ticket_url ? { url: event.ticket_url } : {}),
            ...(event.is_free ? { price: 0 } : lowestPrice !== null ? { price: lowestPrice } : {}),
            ...(event.is_free || lowestPrice !== null ? { priceCurrency: 'EUR' } : {}),
            availability: 'https://schema.org/InStock',
          },
        }
      : {}),
  };
};

export const itemListJsonLd = (items: Array<{ url: string; name: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: item.url,
    name: item.name,
  })),
});

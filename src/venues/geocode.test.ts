import { describe, expect, it } from 'vitest';
import { extractAddress, formatAddress, htmlToText, isNearCity, pickVenueHit } from './geocode';

describe('venue geocoding', () => {
  it('picks a venue-like result in the right city', () => {
    const results = [
      { lat: '1', lon: '1', type: 'advertising_agency', display_name: 'Sidecar, Barcelona' },
      { lat: '2', lon: '2', type: 'nightclub', display_name: 'Sidecar, Madrid' },
      { lat: '3', lon: '3', type: 'bar', display_name: 'Sidecar, Plaça Reial, Barcelona' },
    ];
    expect(pickVenueHit(results, 'Barcelona')?.lat).toBe('3');
    expect(pickVenueHit(results.slice(0, 2), 'Barcelona')).toBeNull();
  });

  it('formats street, number and postcode', () => {
    expect(formatAddress({ lat: '', lon: '', address: { road: 'Calle de la Palma', house_number: '62', postcode: '28015' } }))
      .toBe('Calle de la Palma 62, 28015');
    expect(formatAddress({ lat: '', lon: '' })).toBeNull();
  });

  it('finds the address printed on a venue page', () => {
    const page = htmlToText('<footer><p>Sidecar</p><p>Plaça Reial, 7, Barcelona 08002</p><a>Instagram</a></footer>');
    expect(extractAddress(page)).toBe('Plaça Reial, 7, 08002');
    expect(extractAddress(htmlToText('<p>Black Note · C/ Polo y Peyrolón, 15 · 46021 València</p>')))
      .toBe('C/ Polo y Peyrolón, 15, 46021');
    expect(extractAddress('Conciertos todas las semanas')).toBeNull();
  });

  it('stops at the street number and decodes accents (seen on real venue sites)', () => {
    expect(extractAddress(' Sidecar, Plaça Reial, 7, Barcelona – Sidecar: Club & Concerts. Plaça Reial, 7, Barcelona 08002'))
      .toBe('Plaça Reial, 7');
    expect(extractAddress(htmlToText('uso Carrer de Polo y Peyrol&oacute;n, 15, 46021 Val&egrave;ncia telefono 619')))
      .toBe('Carrer de Polo y Peyrolón, 15, 46021');
  });

  it('rejects a match far from the venue city (same street name in another province)', () => {
    const valencia = { lat: 39.4699, lon: -0.3763 };
    expect(isNearCity({ lat: 38.27748, lon: -0.67968 }, valencia)).toBe(false); // Elche
    expect(isNearCity({ lat: 39.4864, lon: -0.4167 }, valencia)).toBe(true); // Mislata
  });
});

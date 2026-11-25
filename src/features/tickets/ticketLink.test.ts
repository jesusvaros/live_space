import { describe, expect, it } from 'vitest';
import { ticketLink } from './ticketLink';

describe('ticketLink', () => {
  it('uses the official ticket link and names the seller', () => {
    expect(ticketLink({ ticket_url: 'https://link.dice.fm/abc', event_url: 'https://sala.es/c/1' })).toEqual({
      url: 'https://link.dice.fm/abc',
      seller: 'dice',
      official: true,
    });
  });

  it('falls back to the concert page on the venue site', () => {
    expect(ticketLink({ ticket_url: null, event_url: 'https://salagalileo.es/programacion/panuelos/' })).toEqual({
      url: 'https://salagalileo.es/programacion/panuelos/',
      seller: 'venue_page',
      official: false,
    });
  });

  it('adds referral parameters only to the seller that has them', () => {
    const referral = { entradas_com: { affiliate: 'LIVESPACE' } };
    expect(ticketLink({ ticket_url: 'https://www.entradas.com/event/x?a=1' }, referral)?.url).toBe(
      'https://www.entradas.com/event/x?a=1&affiliate=LIVESPACE',
    );
    expect(ticketLink({ ticket_url: 'https://tickets.oneboxtds.com/x' }, referral)?.url).toBe('https://tickets.oneboxtds.com/x');
  });

  it('ignores links that are not web addresses', () => {
    expect(ticketLink({ ticket_url: 'javascript:alert(1)', event_url: 'mailto:a@b.c' })).toBeNull();
    expect(ticketLink({})).toBeNull();
  });

  it('treats unknown ticket sites as other', () => {
    expect(ticketLink({ ticket_url: 'https://entradas.cafelapalma.com/e/1' })?.seller).toBe('other');
  });
});

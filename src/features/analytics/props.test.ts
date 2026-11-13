import { describe, expect, it } from 'vitest';
import { MediaUploadError } from '../../media/errors';
import { appScreenName, notificationType, uploadFailureReason, uploadFailureStatus } from './props';

describe('appScreenName', () => {
  it('groups pages of the same screen', () => {
    expect(appScreenName('/concierto/rosalia-madrid-2026-11-20')).toBe('/concierto/:id');
    expect(appScreenName('/sala/la-riviera')).toBe('/sala/:id');
    expect(appScreenName('/artista/c-tangana/')).toBe('/artista/:id');
    expect(appScreenName('/tabs/artist/1b4e28ba-2fa1-11d2-883f-0016d3cca427')).toBe('/tabs/artist/:id');
    expect(appScreenName('/gestion/evento/abc/qr')).toBe('/gestion/evento/:id/qr');
    expect(appScreenName('/reclamar/venue/123')).toBe('/reclamar/venue/:id');
    expect(appScreenName('/madrid/conciertos/esta-semana')).toBe('/madrid/conciertos/:filtro');
  });

  it('keeps fixed screens and drops query strings', () => {
    expect(appScreenName('/tabs/events')).toBe('/tabs/events');
    expect(appScreenName('/tabs/upload?qr=secret-token')).toBe('/tabs/upload');
    expect(appScreenName('/legal/privacidad')).toBe('/legal/privacidad');
    expect(appScreenName('')).toBe('/');
    expect(appScreenName('/')).toBe('/');
  });

  it('never carries a uuid or a handle', () => {
    expect(appScreenName('/x/1b4e28ba-2fa1-11d2-883f-0016d3cca427/@laura')).toBe('/x/:id/@:handle');
  });
});

describe('notificationType', () => {
  it('passes the known shape and hides anything else', () => {
    expect(notificationType({ type: 'concert_day', route: '/event/1' })).toBe('concert_day');
    expect(notificationType({ type: 'Hola Laura, tu pedido' })).toBe('other');
    expect(notificationType({})).toBe('other');
    expect(notificationType(null)).toBe('other');
  });
});

describe('uploadFailureReason', () => {
  it('is a closed set, never the message', () => {
    const tooBig = new MediaUploadError('file_too_large', 'IMG_2041 de Laura.mov pesa 120 MB');
    expect(uploadFailureReason(tooBig)).toBe('file_too_large');
    expect(uploadFailureStatus(new MediaUploadError('upload_failed', 'x', { status: 502 }))).toBe(502);
    expect(uploadFailureStatus(tooBig)).toBeNull();
    expect(uploadFailureReason({ code: '23505', message: 'duplicate key' })).toBe('db_23505');
    expect(uploadFailureReason({ code: 'PGRST204' })).toBe('db_pgrst204');
    expect(uploadFailureReason(new TypeError('Failed to fetch'))).toBe('network');
    expect(uploadFailureReason(new Error('/private/var/IMG_1.mov'))).toBe('unknown');
    expect(uploadFailureReason(undefined)).toBe('unknown');
  });
});

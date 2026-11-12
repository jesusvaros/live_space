import { describe, expect, it } from 'vitest';
import { WEB_ANALYTICS_TAGS, withWebAnalytics } from './webAnalytics';

const PAGE = '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';

describe('Vercel Web Analytics tags', () => {
  it('go before </head>, once', () => {
    const html = withWebAnalytics(withWebAnalytics(PAGE));
    expect(html.match(/\/_vercel\/insights\/script\.js/g)).toHaveLength(1);
    expect(html.indexOf('/_vercel/insights/script.js')).toBeLessThan(html.indexOf('</head>'));
    expect(html).toContain('<script defer src="/_vercel/insights/script.js"></script>');
  });

  it('never send the query string or the hash (QR upload tokens, order ids)', () => {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(WEB_ANALYTICS_TAGS)![1];
    const fakeWindow: { va?: (...args: unknown[]) => void; vaq?: unknown[][] } = {};
    new Function('window', inline)(fakeWindow);
    const [command, beforeSend] = fakeWindow.vaq![0] as [string, (event: { type: string; url: string }) => unknown];
    expect(command).toBe('beforeSend');
    expect(beforeSend({ type: 'pageview', url: 'https://livespace.example/upload?qr=secret#x' })).toEqual({
      type: 'pageview',
      url: 'https://livespace.example/upload',
    });
  });
});

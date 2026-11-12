// Vercel Web Analytics on the public site (docs/analitica.md): the plain-HTML
// snippet from vercel.com/docs/analytics/quickstart, no npm package. No
// cookies; Vercel only counts aggregated visits. It needs Web Analytics enabled
// in the Vercel project («livespace» → Analytics → Enable); until then the
// script 404s and nothing happens.
//
// beforeSend drops the query string and the hash: a concert QR lands on
// /upload?qr=<upload token> and Stripe sends people back to /vuelta?pedido=…,
// and neither belongs in the stats.

const STRIP_QUERY =
  'window.va("beforeSend",function(e){try{var u=new URL(e.url);u.search="";u.hash="";return Object.assign({},e,{url:u.toString()})}catch(_){return null}});';

export const WEB_ANALYTICS_TAGS = [
  '<script>',
  '  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };',
  `  ${STRIP_QUERY}`,
  '</script>',
  '<script defer src="/_vercel/insights/script.js"></script>',
].join('\n    ');

/** Adds the Web Analytics tags right before </head> (once). */
export const withWebAnalytics = (html: string) =>
  html.includes('/_vercel/insights/script.js') ? html : html.replace('</head>', `    ${WEB_ANALYTICS_TAGS}\n  </head>`);

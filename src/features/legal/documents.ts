// The legal documents, bundled (they open offline and without an account).
// Single source: docs/legal/*.md, also published on the docs site and, by
// the prerender, on the public web at /<slug>/.
import privacidad from '../../../docs/legal/privacidad.md?raw';
import condiciones from '../../../docs/legal/condiciones.md?raw';
import borrarCuenta from '../../../docs/legal/borrar-cuenta.md?raw';
import licenciaMomentos from '../../../docs/legal/licencia-momentos.md?raw';
import type { LegalSlug } from './paths';

export { isLegalSlug, legalAppPath, type LegalSlug } from './paths';

export const LEGAL_DOCUMENTS: Record<LegalSlug, { title: string; markdown: string }> = {
  privacidad: { title: 'Política de privacidad', markdown: privacidad },
  condiciones: { title: 'Condiciones de uso', markdown: condiciones },
  'borrar-cuenta': { title: 'Borrar tu cuenta', markdown: borrarCuenta },
  'licencia-momentos': { title: 'Licencia de los momentos', markdown: licenciaMomentos },
};

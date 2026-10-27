import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import { Spinner } from '../ui/AppPrimitives';
import { AdminClaimRow, ClaimStatus, claimsService, domainFromUrl, isMissingRelation } from '../../services/claims.service';

const FILTERS: Array<{ key: ClaimStatus | 'all'; label: string }> = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobadas' },
  { key: 'rejected', label: 'Rechazadas' },
];

const formatDate = (value: string) =>
  new Date(value).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Admin queue of profile claims. Approving runs review_entity_claim(), which
// creates the membership; nothing here grants access by itself.
const ClaimsQueue: React.FC = () => {
  const [filter, setFilter] = useState<ClaimStatus | 'all'>('pending');
  const [rows, setRows] = useState<AdminClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await claimsService.listForAdmin(filter));
    } catch (err: any) {
      setRows([]);
      setError(isMissingRelation(err) ? 'Falta aplicar la migración de solicitudes (entity_claims).' : err?.message || 'No se han podido cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (row: AdminClaimRow, approve: boolean) => {
    const name = row.subject?.artist?.name || row.subject?.venue?.name || 'este perfil';
    const who = row.claimant?.display_name || row.claimant?.username || row.contact_email;
    const question = approve
      ? `¿Dar acceso de gestión de ${name} a ${who}? Confirma antes que el email o el código de Instagram son correctos.`
      : `¿Rechazar la solicitud de ${who} para ${name}?`;
    if (!window.confirm(question)) return;
    setBusyId(row.id);
    setError('');
    try {
      await claimsService.review(row.id, approve, notes[row.id] || null);
      await load();
    } catch (err: any) {
      setError(err?.message || 'No se ha podido guardar la revisión.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-app-line bg-app-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-app-ink">Solicitudes de gestión</h2>
        {loading ? <Spinner /> : null}
      </div>
      <div className="flex gap-1.5" role="tablist" aria-label="Estado">
        {FILTERS.map(item => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={`min-h-11 rounded-full px-3.5 text-[13px] font-semibold ${
              filter === item.key ? 'bg-app-ink text-app-bg' : 'border border-app-line text-white/70'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="rounded-xl border border-app-line p-4 text-sm text-white/60">No hay solicitudes aquí.</p>
      ) : null}

      <ul className="space-y-3">
        {rows.map(row => {
          const entityName = row.subject?.artist?.name || row.subject?.venue?.name || 'Perfil';
          const entityId = row.subject?.artist?.id || row.subject?.venue?.id;
          const officialDomain = domainFromUrl(row.subject?.venue?.website_url || row.subject?.artist?.external_links?.website);
          const emailDomain = row.contact_email.split('@')[1]?.toLowerCase() || '';
          const domainMatches = officialDomain ? emailDomain === officialDomain || emailDomain.endsWith(`.${officialDomain}`) : null;
          return (
            <li key={row.id} className="space-y-3 rounded-xl border border-app-line bg-app-bg p-3">
              <div className="flex items-center gap-3">
                <Avatar name={entityName} rounded="xl" className="h-11 w-11 text-base" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] font-semibold uppercase text-app-accent">
                    {row.subject?.type === 'venue' ? 'Sala' : 'Artista'} · {formatDate(row.created_at)}
                  </p>
                  {entityId ? (
                    <Link to={`/tabs/${row.subject?.type}/${entityId}`} className="block truncate font-semibold text-app-ink underline-offset-2 hover:underline">
                      {entityName}
                    </Link>
                  ) : (
                    <p className="truncate font-semibold text-app-ink">{entityName}</p>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-white/50">Quién</dt>
                <dd className="text-app-ink">{row.claimant?.display_name || row.claimant?.username || row.claimant_id} · {row.claimant_role}</dd>
                <dt className="text-white/50">Email</dt>
                <dd className="break-all text-app-ink">
                  {row.contact_email}
                  {domainMatches === true ? <span className="ml-2 text-emerald-400">coincide con {officialDomain}</span> : null}
                  {domainMatches === false ? <span className="ml-2 text-amber-300">no es @{officialDomain}</span> : null}
                </dd>
                <dt className="text-white/50">Método</dt>
                <dd className="text-app-ink">
                  {row.verification_method === 'instagram_code'
                    ? `Código en Instagram @${row.instagram_handle}`
                    : 'Email del dominio oficial'}
                  {' · '}
                  <span className="font-mono">LS-{row.verification_code}</span>
                </dd>
                {row.message ? (
                  <>
                    <dt className="text-white/50">Mensaje</dt>
                    <dd className="whitespace-pre-wrap text-white/80">{row.message}</dd>
                  </>
                ) : null}
                {row.review_note ? (
                  <>
                    <dt className="text-white/50">Nota</dt>
                    <dd className="text-white/80">{row.review_note}</dd>
                  </>
                ) : null}
              </dl>
              {row.status === 'pending' ? (
                <>
                  <input
                    className="min-h-11 w-full rounded-xl border border-app-line bg-app-surface px-3 text-sm text-app-ink placeholder:text-white/35"
                    placeholder="Nota (opcional, la ve la persona)"
                    value={notes[row.id] || ''}
                    onChange={event => setNotes(prev => ({ ...prev, [row.id]: event.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" disabled={busyId === row.id} onClick={() => review(row, false)}>
                      Rechazar
                    </Button>
                    <Button className="flex-1" disabled={busyId === row.id} onClick={() => review(row, true)}>
                      Aprobar
                    </Button>
                  </div>
                </>
              ) : (
                <p className={`font-mono text-[11px] font-semibold uppercase ${row.status === 'approved' ? 'text-emerald-400' : 'text-rose-300'}`}>
                  {row.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                  {row.reviewed_at ? ` · ${formatDate(row.reviewed_at)}` : ''}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ClaimsQueue;

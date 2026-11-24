import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import Avatar from '../components/ui/Avatar';
import { IconChevronLeft } from '../components/icons';
import { Spinner } from '../components/ui/AppPrimitives';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { EntityStatsPanel } from '../features/community/EntityStats';
import type { ManagedEntity } from '../lib/types';
import { canGoBack } from '../app/useGoBack';

const entityName = (entity: ManagedEntity) => entity.artist?.name || entity.venue?.name || 'Sin nombre';

// /gestion/estadisticas[?entidad=<subject id>]
const GestionEstadisticas: React.FC = () => {
  const { managedEntities, activeWorkspace, loading } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const entities = useMemo(
    () => managedEntities.filter(entity => entity.type === 'artist' || entity.type === 'venue'),
    [managedEntities],
  );
  const requested = params.get('entidad');
  const selected =
    entities.find(entity => entity.subject_id === requested) ||
    entities.find(entity => entity.subject_id === activeWorkspace?.subject_id) ||
    entities[0] ||
    null;

  return (
    <AppShell headerProps={null}>
      <div className="px-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))] pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <header className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Volver"
            onClick={() => {
              if (canGoBack()) navigate(-1);
              else navigate('/tabs/profile', { replace: true });
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
          >
            <IconChevronLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 font-display text-lg font-bold text-app-ink">Estadísticas</h1>
            {selected ? <p className="m-0 truncate text-xs text-[#8f8b84]">{entityName(selected)} · {selected.type === 'venue' ? 'sala' : 'artista'}</p> : null}
          </div>
        </header>

        {loading && entities.length === 0 ? (
          <div className="flex justify-center py-12 text-white/70">
            <Spinner />
          </div>
        ) : !selected ? (
          <div className="mt-6 rounded-2xl border border-app-line bg-app-surface p-4">
            <p className="m-0 font-display text-base font-bold text-app-ink">No gestionas ninguna sala ni artista</p>
            <p className="m-0 mt-1 text-sm text-white/60">
              Cuando reclames tu sala o tu proyecto verás aquí cuánta gente guarda y va a tus conciertos.
            </p>
          </div>
        ) : (
          <>
            {entities.length > 1 ? (
              <div role="tablist" aria-label="Qué gestionas" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {entities.map(entity => {
                  const active = entity.subject_id === selected.subject_id;
                  return (
                    <button
                      key={entity.subject_id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setParams({ entidad: entity.subject_id }, { replace: true })}
                      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-4 text-sm font-semibold transition ${
                        active ? 'border-app-ink bg-app-ink text-app-bg' : 'border-app-line bg-transparent text-white/75'
                      }`}
                    >
                      <Avatar name={entityName(entity)} src={entity.artist?.avatar_url} className="h-8 w-8 text-[11px]" />
                      {entityName(entity)}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="mt-4">
              <EntityStatsPanel key={selected.subject_id} subjectId={selected.subject_id} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default GestionEstadisticas;

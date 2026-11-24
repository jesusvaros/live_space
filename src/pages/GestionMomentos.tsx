import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconChevronLeft } from '../components/icons';
import { Spinner } from '../components/ui/AppPrimitives';
import { canGoBack } from '../app/useGoBack';
import { eventManagementService, type ManagedEvent } from '../services/eventManagement.service';
import EventMomentsManager, { CreditBox } from '../features/community/EventMomentsManager';
import { creditLine, downloadableFiles, fetchEventMoments, setMomentHidden, type ManagedMoment } from '../features/community/eventMoments';
import { saveMediaFiles } from '../features/community/saveMedia';
import { isForbidden } from '../features/community/api';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { isProActive } from '../features/pro/planRules';
import { useSubjectPlans } from '../features/pro/useSubjectPlan';

// /gestion/evento/:id/momentos — what the audience filmed at one concert,
// for its artist, venue or festival: hide (free) and download (Pro, with the
// fan's licence).
const GestionMomentos: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<ManagedEvent | null>(null);
  const [moments, setMoments] = useState<ManagedMoment[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [credit, setCredit] = useState('');
  // Downloads are a Pro perk (same rule as a moment's detail); hiding is free.
  const { managedEntities } = useWorkspace();
  const managedIds = managedEntities.filter(entity => entity.type === 'artist' || entity.type === 'venue').map(entity => entity.subject_id);
  const { plans } = useSubjectPlans(managedIds);
  const canDownload = [...plans.values()].some(plan => isProActive(plan));

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [found, list] = await Promise.all([eventManagementService.getEvent(id), fetchEventMoments(id)]);
      setEvent(found);
      setMoments(list);
      setError('');
    } catch (err) {
      setError(isForbidden(err) ? 'Solo quien gestiona este concierto puede ver esto.' : 'No se han podido cargar los momentos.');
      setMoments([]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const goBack = () => {
    if (canGoBack()) navigate(-1);
    else navigate('/gestion', { replace: true });
  };

  const setHidden = async (postIds: string[], hidden: boolean) => {
    setBusy(true);
    try {
      for (const postId of postIds) await setMomentHidden(postId, hidden);
      setMoments(current => (current || []).map(moment => (postIds.includes(moment.post_id) ? { ...moment, hidden } : moment)));
    } catch {
      setError('No se ha podido guardar. Prueba otra vez.');
    } finally {
      setBusy(false);
    }
  };

  const download = async (chosen: ManagedMoment[]) => {
    setBusy(true);
    try {
      await saveMediaFiles(downloadableFiles(event?.headliner?.name || event?.name || 'concierto', chosen));
      setCredit(creditLine(chosen));
    } catch {
      setError('No se ha podido descargar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-app-bg text-app-ink">
      <header className="flex items-center gap-2 px-3 pb-3 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={goBack}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
        >
          <IconChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold">Momentos</h1>
          {event ? <p className="truncate text-[12px] text-white/55">{event.name}</p> : null}
        </div>
      </header>

      {error ? <p className="px-4 pb-3 text-sm text-rose-400">{error}</p> : null}
      {credit ? (
        <div className="px-4 pb-3">
          <CreditBox line={credit} />
        </div>
      ) : null}

      {moments === null ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <EventMomentsManager moments={moments} busy={busy} canDownload={canDownload} onSetHidden={setHidden} onDownload={download} />
      )}
    </div>
  );
};

export default GestionMomentos;

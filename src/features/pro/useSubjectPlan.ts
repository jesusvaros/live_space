import { useEffect, useState } from 'react';
import { plansService } from '../../services/plans.service';
import { isProActive, type SubjectPlan } from './planRules';

type State = { loading: boolean; plans: Map<string, SubjectPlan> };

/** Plans of some managed artists/venues (no row = free). */
export const useSubjectPlans = (subjectIds: string[]) => {
  const key = [...new Set(subjectIds.filter(Boolean))].sort().join(',');
  const [state, setState] = useState<State>({ loading: Boolean(key), plans: new Map() });

  useEffect(() => {
    if (!key) {
      setState({ loading: false, plans: new Map() });
      return undefined;
    }
    let live = true;
    setState(current => ({ ...current, loading: true }));
    plansService
      .forSubjects(key.split(','))
      .then(plans => {
        if (live) setState({ loading: false, plans });
      })
      .catch(() => {
        if (live) setState({ loading: false, plans: new Map() });
      });
    return () => {
      live = false;
    };
  }, [key]);

  return state;
};

/** The plan of one managed artist/venue, and whether it is Pro now. */
export const useSubjectPlan = (subjectId: string | null | undefined) => {
  const { loading, plans } = useSubjectPlans(subjectId ? [subjectId] : []);
  const plan = subjectId ? plans.get(subjectId) ?? null : null;
  return { loading, plan, isPro: isProActive(plan) };
};

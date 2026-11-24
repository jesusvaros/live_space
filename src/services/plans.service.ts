import { supabase } from '../api';
import type { SubjectPlan } from '../features/pro/planRules';

type Row = {
  subject_id: string;
  plan: SubjectPlan['plan'];
  status: SubjectPlan['status'];
  source: SubjectPlan['source'];
  founder: boolean;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

const mapRow = (row: Row): SubjectPlan => ({
  subjectId: row.subject_id,
  plan: row.plan,
  status: row.status,
  source: row.source,
  founder: row.founder,
  trialEndsAt: row.trial_ends_at,
  currentPeriodEnd: row.current_period_end,
});

const COLUMNS = 'subject_id,plan,status,source,founder,trial_ends_at,current_period_end';

// Plans of the artists and venues the user manages (RLS: managers read their
// own rows; no row = free). Missing table (migration not applied yet) = free.
export const plansService = {
  async forSubjects(subjectIds: string[]): Promise<Map<string, SubjectPlan>> {
    const ids = [...new Set(subjectIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const { data, error } = await supabase.from('subject_plans').select(COLUMNS).in('subject_id', ids);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return new Map();
      throw error;
    }
    return new Map(((data || []) as Row[]).map(row => [row.subject_id, mapRow(row)]));
  },
};

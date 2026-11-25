import { supabase } from '../../lib/supabase';

// Everyone at a concert can share its photos: a profile's numbers (to be
// proud of) and the people someone follows (Momentos › Siguiendo).

export type PhotoStats = { followers: number; photos: number; likes: number; concerts: number };

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);

export const photographersService = {
  async stats(profileId: string): Promise<PhotoStats | null> {
    const { data, error } = await supabase.rpc('get_profile_photo_stats', { p_profile_id: profileId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { followers: num(row.followers), photos: num(row.photos), likes: num(row.likes), concerts: num(row.concerts) };
  },
};

/** Profile ids of the people (user subjects) this subject follows. */
export const fetchFollowedPeopleIds = async (mySubjectId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('follows')
    .select('target:subjects!follows_target_subject_id_fkey(type, profile_id)')
    .eq('follower_subject_id', mySubjectId);
  if (error) throw error;
  return ((data as unknown as { target: { type: string; profile_id: string | null } | null }[]) ?? [])
    .flatMap(row => (row.target?.type === 'user' && row.target.profile_id ? [row.target.profile_id] : []));
};

/** «1,2 mil» from 1200: compact and Spanish. */
export const compactCount = (value: number) =>
  new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

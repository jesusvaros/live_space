import { supabase } from '../api';

export const socialService = {
  async follow(followerSubjectId: string, targetSubjectId: string): Promise<void> {
    const { error } = await supabase
      .from('follows')
      .insert({
        follower_subject_id: followerSubjectId,
        target_subject_id: targetSubjectId
      });
    if (error) throw error;
  },

  // One request for many targets; already-followed ones are left as they are.
  async followMany(followerSubjectId: string, targetSubjectIds: string[]): Promise<void> {
    const rows = Array.from(new Set(targetSubjectIds))
      .filter(id => id && id !== followerSubjectId)
      .map(id => ({ follower_subject_id: followerSubjectId, target_subject_id: id }));
    if (rows.length === 0) return;
    const { error } = await supabase
      .from('follows')
      .upsert(rows, { onConflict: 'follower_subject_id,target_subject_id', ignoreDuplicates: true });
    if (error) throw error;
  },

  async unfollow(followerSubjectId: string, targetSubjectId: string): Promise<void> {
    const { error } = await supabase
      .from('follows')
      .delete()
      .match({
        follower_subject_id: followerSubjectId,
        target_subject_id: targetSubjectId
      });
    if (error) throw error;
  },

  async isFollowing(followerSubjectId: string, targetSubjectId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('follows')
      .select('created_at')
      .match({
        follower_subject_id: followerSubjectId,
        target_subject_id: targetSubjectId
      })
      .maybeSingle();
    if (error) throw error;
    return !!data;
  },

  async getFollowersCount(subjectId: string): Promise<number> {
    const { count, error } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('target_subject_id', subjectId);
    // Not readable without a session; the count is decoration, not data.
    if (error) return 0;
    return count || 0;
  },

  async getFollowingCount(subjectId: string): Promise<number> {
    const { count, error } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_subject_id', subjectId);
    if (error) throw error;
    return count || 0;
  }
};

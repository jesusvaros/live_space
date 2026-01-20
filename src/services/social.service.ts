import { supabase } from '../lib/supabase';

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
    if (error) throw error;
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

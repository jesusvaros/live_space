import { supabase } from '../lib/supabase';
import { ManagedEntity } from '../lib/types';

export const managementService = {
  async getManagedEntities(profileId: string): Promise<ManagedEntity[]> {
    const { data, error } = await supabase
      .from('entity_admins')
      .select(`
        subject_id,
        role,
        subjects!inner (
          type
        )
      `)
      .eq('profile_id', profileId);

    if (error) throw error;

    return Promise.all(
      (data as any[]).map(async (item) => {
        const type = item.subjects.type;
        const entity: ManagedEntity = {
          subject_id: item.subject_id,
          role: item.role,
          type: type
        };

        if (type === 'artist') {
          const { data: artist } = await supabase
            .from('v_subject_artists')
            .select('*')
            .eq('subject_id', item.subject_id)
            .maybeSingle();
          if (artist) entity.artist = artist;
        } else if (type === 'venue') {
          const { data: venue } = await supabase
            .from('v_subject_venues')
            .select('*')
            .eq('subject_id', item.subject_id)
            .maybeSingle();
          if (venue) entity.venue = venue;
        } else if (type === 'user') {
          const { data: profile } = await supabase
            .from('v_subject_users')
            .select('*')
            .eq('subject_id', item.subject_id)
            .maybeSingle();
          if (profile) entity.profile = profile;
        }
        return entity;
      })
    );
  },

  async addAdmin(subjectId: string, profileId: string, role: string = 'admin'): Promise<void> {
    const { error } = await supabase
      .from('entity_admins')
      .insert({
        subject_id: subjectId,
        profile_id: profileId,
        role
      });
    if (error) throw error;
  },

  async removeAdmin(subjectId: string, profileId: string): Promise<void> {
    const { error } = await supabase
      .from('entity_admins')
      .delete()
      .match({ subject_id: subjectId, profile_id: profileId });
    if (error) throw error;
  }
};

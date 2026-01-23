import { supabase } from '../lib/supabase';
import { ManagedEntity } from '../lib/types';
import { cached } from '../lib/requestCache';

export const managementService = {
  async getManagedEntities(profileId: string): Promise<ManagedEntity[]> {
    // 1. Get user_subject_id
    const subjectId = await cached(
      `subject:user:${profileId}`,
      async () => {
        const { data, error } = await supabase
          .rpc('get_or_create_user_subject', { p_profile_id: profileId });
        if (error) throw error;
        return data as unknown as string;
      },
      { ttlMs: 24 * 60 * 60 * 1000 }
    );

    // 2. Query entity_members where admin_subject_id = user_subject_id
    const { data, error } = await supabase
      .from('entity_members')
      .select(`
        admin_subject_id,
        entity_subject_id,
        role,
        subjects:entity_subject_id (
          id,
          type
        )
      `)
      .eq('admin_subject_id', subjectId);

    if (error) throw error;

    return Promise.all(
      (data as any[]).map(async (item) => {
        const type = item.subjects.type;
        const entity: ManagedEntity = {
          subject_id: item.entity_subject_id,
          role: item.role,
          type: type
        };

        if (type === 'artist') {
          const artist = await cached(
            `v_subject_artists:by_subject:${item.entity_subject_id}`,
            async () => {
              const { data, error } = await supabase
                .from('v_subject_artists')
                .select('*')
                .eq('subject_id', item.entity_subject_id)
                .maybeSingle();
              if (error) throw error;
              return data;
            },
            { ttlMs: 60_000 }
          );
          if (artist) {
            entity.artist = {
              ...artist,
              id: (artist as any).artist_id ?? (artist as any).id
            };
          }
        } else if (type === 'venue') {
          const venue = await cached(
            `v_subject_venues:by_subject:${item.entity_subject_id}`,
            async () => {
              const { data, error } = await supabase
                .from('v_subject_venues')
                .select('*')
                .eq('subject_id', item.entity_subject_id)
                .maybeSingle();
              if (error) throw error;
              return data;
            },
            { ttlMs: 60_000 }
          );
          if (venue) {
            entity.venue = {
              ...venue,
              id: (venue as any).venue_place_id ?? (venue as any).id
            };
          }
        }
        return entity;
      })
    );
  },

  async adminGrantEntityAccess(
    targetProfileId: string,
    entityType: 'artist' | 'venue',
    entityId: string,
    role: 'owner' | 'admin' | 'editor' | 'moderator' = 'admin'
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_grant_entity_access', {
      p_target_profile_id: targetProfileId,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_role: role
    });
    if (error) throw error;
  },

  async removeMember(adminSubjectId: string, entitySubjectId: string): Promise<void> {
    const { error } = await supabase
      .from('entity_members')
      .delete()
      .match({ admin_subject_id: adminSubjectId, entity_subject_id: entitySubjectId });
    if (error) throw error;
  },

  async searchProfiles(query: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .limit(10);
    
    if (error) throw error;
    return data;
  },

  async searchArtists(query: string) {
    const { data, error } = await supabase
      .from('artists')
      .select('id, name, artist_type, city, avatar_url')
      .ilike('name', `%${query}%`)
      .order('name', { ascending: true })
      .limit(10);
    if (error) throw error;
    return data?.map((a) => ({
      ...a,
      image_url: (a as any).avatar_url ?? null
    }));
  },

  async searchVenues(query: string) {
    const { data, error } = await supabase
      .from('venue_places')
      .select('id, name, city, photos, venue_type')
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .order('name', { ascending: true })
      .limit(10);
    if (error) throw error;
    return data?.map((v) => ({
      ...v,
      image_url: (v as any).photos?.[0] ?? null
    }));
  }
};

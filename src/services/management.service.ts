import { supabase } from '../api';
import { ManagedEntity } from '../lib/types';
import { mapArtist, mapVenue } from '../data/canonicalMappers';

export const managementService = {
  async getManagedEntities(profileId: string): Promise<ManagedEntity[]> {
    const { data, error } = await supabase
      .from('entity_memberships')
      .select(`
        subject_id,
        profile_id,
        role,
        subject:subjects!entity_memberships_subject_id_fkey (
          id,
          type,
          artist:artists (id,name,artist_type,city,bio,genres,external_links,created_at,updated_at),
          venue:venue_places (id,name,city,address,capacity,venue_type,latitude,longitude,website_url,created_by,created_at,updated_at)
        )
      `)
      .eq('profile_id', profileId);

    if (error) throw error;

    return (data as any[]).map(item => {
      const subject = item.subject;
      const entity: ManagedEntity = { subject_id: item.subject_id, role: item.role, type: subject.type };
      if (subject.type === 'artist' && subject.artist) {
        entity.artist = mapArtist({ ...subject.artist, subject_id: item.subject_id });
      }
      if (subject.type === 'venue' && subject.venue) {
        entity.venue = mapVenue({ ...subject.venue, subject_id: item.subject_id, photos: [] });
      }
      return entity;
    });
  },

  async adminGrantEntityAccess(
    targetProfileId: string,
    entityType: 'artist' | 'venue',
    entityId: string,
    role: 'owner' | 'admin' | 'editor' | 'moderator' = 'admin'
  ): Promise<void> {
    const foreignColumn = entityType === 'artist' ? 'artist_id' : 'venue_place_id';
    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('id')
      .eq('type', entityType)
      .eq(foreignColumn, entityId)
      .single();
    if (subjectError) throw subjectError;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw authError ?? new Error('Authentication required');
    const { error } = await supabase.from('entity_memberships').upsert({
      subject_id: subject.id,
      profile_id: targetProfileId,
      role,
      created_by: authData.user.id,
    }, { onConflict: 'subject_id,profile_id' });
    if (error) throw error;
  },

  async removeMember(adminSubjectId: string, entitySubjectId: string): Promise<void> {
    const { data: admin, error: adminError } = await supabase
      .from('subjects')
      .select('profile_id')
      .eq('id', adminSubjectId)
      .eq('type', 'user')
      .single();
    if (adminError) throw adminError;
    const { error } = await supabase
      .from('entity_memberships')
      .delete()
      .match({ profile_id: admin.profile_id, subject_id: entitySubjectId });
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
      .from('v_subject_artists')
      .select('artist_id, subject_id, name, artist_type, city, avatar_url')
      .ilike('name', `%${query}%`)
      .order('name', { ascending: true })
      .limit(10);
    if (error) throw error;
    return data?.map((a: any) => ({
      ...mapArtist(a),
      image_url: a.avatar_url ?? null
    }));
  },

  async searchVenues(query: string) {
    const { data, error } = await supabase
      .from('v_subject_venues')
      .select('venue_place_id, subject_id, name, city, photos, venue_type')
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .order('name', { ascending: true })
      .limit(10);
    if (error) throw error;
    return data?.map((v: any) => ({
      ...mapVenue(v),
      image_url: v.photos?.[0] ?? null
    }));
  }
};

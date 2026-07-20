import { supabase } from '../api';
import { VenuePlace } from '../lib/types';
import { mapVenue } from '../data/canonicalMappers';
import { normalizeForMatching } from '../normalize/normalizeText';

export const venueService = {
  async createVenue(venue: Omit<VenuePlace, 'id' | 'created_at' | 'updated_at' | 'subject_id'>): Promise<VenuePlace> {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw authError ?? new Error('Authentication required');

    const { data, error } = await supabase
      .from('venue_places')
      .insert({
        name: venue.name,
        normalized_name: normalizeForMatching(venue.name),
        city: venue.city,
        address: venue.address,
        capacity: venue.capacity,
        venue_type: venue.venue_type,
        latitude: venue.latitude,
        longitude: venue.longitude,
        website_url: venue.website_url,
        created_by: authData.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Ensure subject exists using RPC
    const { data: subjectId, error: rpcError } = await supabase
      .rpc('get_or_create_venue_subject', { p_venue_place_id: data.id });

    if (rpcError) throw rpcError;

    return mapVenue({ ...data, subject_id: subjectId, photos: venue.photos });
  },

  async getVenueBySubject(subjectId: string): Promise<VenuePlace | null> {
    const { data, error } = await supabase
      .from('v_subject_venues')
      .select('*')
      .eq('subject_id', subjectId)
      .maybeSingle();

    if (error) throw error;
    return data ? mapVenue(data) : null;
  },

  async updateVenue(id: string, updates: Partial<VenuePlace>): Promise<VenuePlace> {
    const payload = {
      ...(updates.name === undefined ? {} : { name: updates.name, normalized_name: normalizeForMatching(updates.name) }),
      ...(updates.city === undefined ? {} : { city: updates.city }),
      ...(updates.address === undefined ? {} : { address: updates.address }),
      ...(updates.capacity === undefined ? {} : { capacity: updates.capacity }),
      ...(updates.venue_type === undefined ? {} : { venue_type: updates.venue_type }),
      ...(updates.latitude === undefined ? {} : { latitude: updates.latitude }),
      ...(updates.longitude === undefined ? {} : { longitude: updates.longitude }),
      ...(updates.website_url === undefined ? {} : { website_url: updates.website_url }),
    };
    const { data, error } = await supabase
      .from('venue_places')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapVenue(data);
  }
};

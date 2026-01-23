import { supabase } from '../lib/supabase';
import { VenuePlace } from '../lib/types';

export const venueService = {
  async createVenue(venue: Omit<VenuePlace, 'id' | 'created_at' | 'updated_at' | 'subject_id'>): Promise<VenuePlace> {
    // 1. Create venue place first
    const { data, error } = await supabase
      .from('venue_places')
      .insert(venue)
      .select()
      .single();

    if (error) throw error;

    // 2. Ensure subject exists using RPC
    const { data: subjectId, error: rpcError } = await supabase
      .rpc('get_or_create_venue_subject', { p_venue_place_id: data.id });

    if (rpcError) throw rpcError;

    return { ...data, subject_id: subjectId };
  },

  async getVenueBySubject(subjectId: string): Promise<VenuePlace | null> {
    const { data, error } = await supabase
      .from('v_subject_venues')
      .select('*')
      .eq('subject_id', subjectId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async updateVenue(id: string, updates: Partial<VenuePlace>): Promise<VenuePlace> {
    const { data, error } = await supabase
      .from('venue_places')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

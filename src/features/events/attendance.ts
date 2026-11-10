import { supabase } from '../../lib/supabase';
import type { AttendanceStatus } from '../../lib/types';
import { enableMomentNudges } from '../moments/momentNudge';

// «Voy» / «Fui» for the signed-in user (event_attendance, one row per event and
// profile, RLS: own rows only).

export const fetchAttendanceStatus = async (eventId: string, profileId: string): Promise<AttendanceStatus | null> => {
  const { data, error } = await supabase
    .from('event_attendance')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  const status = data?.status;
  return status === 'going' || status === 'attended' ? status : null;
};

/** What «Marcar» means for this concert: «Fui» once it is over, «Voy» before. */
export const attendanceTargetFor = (startsAt: string, endsAt: string | null, now = new Date()): AttendanceStatus => {
  const start = Date.parse(startsAt);
  const end = endsAt ? Date.parse(endsAt) : start + 6 * 60 * 60 * 1000;
  return now.getTime() > end ? 'attended' : 'going';
};

export const markAttendance = async (eventId: string, profileId: string, status: AttendanceStatus) => {
  const { error } = await supabase
    .from('event_attendance')
    .upsert({ event_id: eventId, profile_id: profileId, status }, { onConflict: 'event_id,profile_id' });
  if (error) throw error;
  if (status === 'going') void enableMomentNudges(profileId);
};

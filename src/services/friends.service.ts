import { supabase } from '../api';

// People = user subjects in public.follows (every «Seguir» button for a person
// writes there). Friends = two people who follow each other. Which concerts
// someone you follow is going to only comes through friends_going() (you
// follow them, their «Tus planes» setting, blocks); attendance stays private
// otherwise.

export type FriendGoing = {
  eventId: string;
  startsAt: string;
  friendId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

export type Person = {
  id: string;
  subjectId: string | null;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

export type Relation = { iFollow: boolean; followsMe: boolean };

type GoingRow = {
  event_id: string;
  starts_at: string;
  friend_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export const personName = (person: { display_name?: string | null; username?: string | null }) =>
  person.display_name?.trim() || (person.username ? `@${person.username}` : 'Alguien');

/** Rows of friends_going grouped by concert, soonest first. */
export const groupByEvent = (rows: FriendGoing[]) => {
  const map = new Map<string, FriendGoing[]>();
  rows.forEach(row => map.set(row.eventId, [...(map.get(row.eventId) || []), row]));
  return [...map.entries()]
    .map(([eventId, friends]) => ({ eventId, startsAt: friends[0].startsAt, friends }))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
};

/** Search text → what to match on: "@ana" and "ana" both look at usernames and names. */
export const searchTerm = (raw: string) => raw.trim().replace(/^@+/, '').replace(/[%_,()]/g, '').slice(0, 32);

export const friendsService = {
  async going(options: { from?: string; to?: string; friendId?: string; eventId?: string } = {}): Promise<FriendGoing[]> {
    const { data, error } = await supabase.rpc('friends_going', {
      p_from: options.from ?? null,
      p_to: options.to ?? null,
      p_friend: options.friendId ?? null,
      p_event: options.eventId ?? null,
    });
    if (error) throw error;
    return ((data || []) as GoingRow[]).map(row => ({
      eventId: row.event_id,
      startsAt: row.starts_at,
      friendId: row.friend_id,
      name: personName(row),
      username: row.username,
      avatarUrl: row.avatar_url,
    }));
  },

  async search(raw: string, excludeId?: string | null): Promise<Person[]> {
    const term = searchTerm(raw);
    if (term.length < 2) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.${term}%,display_name.ilike.%${term}%`)
      .limit(20);
    if (error) throw error;
    const people = (data || []).filter(profile => profile.id !== excludeId);
    if (people.length === 0) return [];
    const { data: subjects, error: subjectsError } = await supabase
      .from('subjects')
      .select('id, profile_id')
      .eq('type', 'user')
      .in('profile_id', people.map(profile => profile.id));
    if (subjectsError) throw subjectsError;
    const subjectOf = new Map((subjects || []).map(row => [String(row.profile_id), String(row.id)]));
    return people.map(profile => ({
      id: String(profile.id),
      subjectId: subjectOf.get(String(profile.id)) ?? null,
      name: personName(profile),
      username: profile.username ?? null,
      avatarUrl: profile.avatar_url ?? null,
    }));
  },

  async relation(mySubjectId: string, theirSubjectId: string): Promise<Relation> {
    const { data, error } = await supabase
      .from('follows')
      .select('follower_subject_id, target_subject_id')
      .or(
        `and(follower_subject_id.eq.${mySubjectId},target_subject_id.eq.${theirSubjectId}),and(follower_subject_id.eq.${theirSubjectId},target_subject_id.eq.${mySubjectId})`,
      );
    if (error) throw error;
    const rows = data || [];
    return {
      iFollow: rows.some(row => row.follower_subject_id === mySubjectId),
      followsMe: rows.some(row => row.follower_subject_id === theirSubjectId),
    };
  },

  /** People you follow or who follow you, each with the relation. */
  async myPeople(mySubjectId: string): Promise<(Person & Relation)[]> {
    const { data, error } = await supabase
      .from('follows')
      .select('follower_subject_id, target_subject_id')
      .or(`follower_subject_id.eq.${mySubjectId},target_subject_id.eq.${mySubjectId}`)
      .limit(1000);
    if (error) throw error;
    const relations = new Map<string, Relation>();
    (data || []).forEach(row => {
      const other = row.follower_subject_id === mySubjectId ? row.target_subject_id : row.follower_subject_id;
      const current = relations.get(other) || { iFollow: false, followsMe: false };
      if (row.follower_subject_id === mySubjectId) current.iFollow = true;
      else current.followsMe = true;
      relations.set(other, current);
    });
    if (relations.size === 0) return [];
    const { data: subjects, error: subjectsError } = await supabase
      .from('subjects')
      .select('id, profile:profiles!subjects_profile_id_fkey(id, username, display_name, avatar_url)')
      .eq('type', 'user')
      .in('id', [...relations.keys()]);
    if (subjectsError) throw subjectsError;
    return ((subjects || []) as any[])
      .map((row): (Person & Relation) | null => {
        const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
        if (!profile) return null;
        return {
          id: String(profile.id),
          subjectId: String(row.id),
          name: personName(profile),
          username: profile.username ?? null,
          avatarUrl: profile.avatar_url ?? null,
          ...(relations.get(String(row.id)) as Relation),
        };
      })
      .filter((person): person is Person & Relation => Boolean(person))
      .sort((left, right) => Number(right.iFollow && right.followsMe) - Number(left.iFollow && left.followsMe) || left.name.localeCompare(right.name));
  },

  async setPlansVisibility(userId: string, visibility: 'amigos' | 'nadie') {
    const { error } = await supabase.from('profiles').update({ plans_visibility: visibility }).eq('id', userId);
    if (error) throw error;
  },
};

/** The label of the follow button for a person. */
export const followLabel = (relation: Relation) =>
  relation.iFollow ? (relation.followsMe ? 'Amigos' : 'Siguiendo') : relation.followsMe ? 'Seguir también' : 'Seguir';

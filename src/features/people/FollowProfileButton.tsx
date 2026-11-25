import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { askForAccount } from '../../auth/askForAccount';
import { friendsService, type Relation } from '../../services/friends.service';
import FollowPersonButton from '../friends/FollowPersonButton';

// «Seguir» for a person anywhere (a gallery section, Explorar's «Personas»):
// works out both subjects and the relation itself. Nothing for yourself.
const FollowProfileButton: React.FC<{ profileId: string; subjectId?: string | null; className?: string }> = ({
  profileId,
  subjectId,
  className,
}) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [theirSubject, setTheirSubject] = useState<string | null>(subjectId ?? null);
  const [relation, setRelation] = useState<Relation | null>(null);
  const mySubject = profile?.subject_id ?? null;
  const isMe = user?.id === profileId;

  useEffect(() => {
    if (subjectId || isMe) return;
    let cancelled = false;
    void supabase
      .from('subjects')
      .select('id')
      .eq('type', 'user')
      .eq('profile_id', profileId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setTheirSubject((data?.id as string | undefined) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, subjectId, isMe]);

  useEffect(() => {
    if (!mySubject || !theirSubject || isMe) return;
    let cancelled = false;
    friendsService
      .relation(mySubject, theirSubject)
      .then(next => {
        if (!cancelled) setRelation(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mySubject, theirSubject, isMe]);

  if (isMe) return null;
  if (!user) {
    return (
      <button
        type="button"
        onClick={() => askForAccount(navigate, 'Crea tu cuenta para seguir a gente y ver sus fotos de conciertos.')}
        className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-app-ink px-4 text-[13px] font-semibold text-app-bg ${className ?? ''}`}
      >
        Seguir
      </button>
    );
  }
  if (!mySubject || !theirSubject || !relation) return null;
  return (
    <FollowPersonButton
      mySubjectId={mySubject}
      theirSubjectId={theirSubject}
      relation={relation}
      onChange={setRelation}
      className={className}
    />
  );
};

export default FollowProfileButton;

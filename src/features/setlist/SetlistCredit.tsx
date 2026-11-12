import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { EventSetlistEntry } from '../../lib/types';
import { useBlockedUserIds } from '../blocks/useBlockedUsers';

// «Setlist aportado por @usuario» under an approved audience setlist. Hidden
// when the contributor is someone the viewer blocked, or has no username.

const SetlistCredit: React.FC<{ setlist: readonly EventSetlistEntry[]; className?: string }> = ({ setlist, className = '' }) => {
  const blocked = useBlockedUserIds();
  const audience = setlist.length > 0 && setlist.every(entry => entry.source === 'audience');
  const contributor = audience ? setlist.find(entry => entry.created_by)?.created_by ?? null : null;
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setUsername(null);
    if (!contributor) return undefined;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', contributor)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setUsername((data?.username as string | null | undefined) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [contributor]);

  if (!contributor || !username || blocked.has(contributor)) return null;
  return (
    <p className={`text-[11px] text-white/45 ${className}`}>
      Setlist aportado por{' '}
      <Link to={`/profile/${contributor}`} className="inline-flex min-h-11 items-center underline decoration-white/30 underline-offset-2">
        @{username}
      </Link>
    </p>
  );
};

export default SetlistCredit;

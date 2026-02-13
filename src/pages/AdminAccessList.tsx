import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, IonSpinner } from '@ionic/react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import AdminActionsNav from '../components/admin/AdminActionsNav';

type AccessRow = {
  admin_subject_id: string;
  entity_subject_id: string;
  role: string;
  created_at?: string;
  admin?: {
    profile?: {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    };
  };
  entity?: {
    type: 'artist' | 'venue' | string;
    profile?: { username: string | null; display_name: string | null };
    venue_place?: { name: string; city: string | null };
    artist?: { name: string; city: string | null };
  };
};

const AdminAccessList: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AccessRow[]>([]);

  useEffect(() => {
    const fetchAccesses = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('entity_members')
          .select(`
            admin_subject_id,
            entity_subject_id,
            role,
            created_at,
            admin:admin_subject_id (
              profile:profile_id (
                id,
                username,
                display_name,
                avatar_url
              )
            ),
            entity:entity_subject_id (
              type,
              profile:profile_id (
                username,
                display_name
              ),
              venue_place:venue_place_id (
                name,
                city
              ),
              artist:artist_id (
                name,
                city
              )
            )
          `)
          .order('created_at', { ascending: false });

        if (err) throw err;
        setRows(data as AccessRow[]);
      } catch (e: any) {
        setError(e.message || 'Failed to load access grants');
      } finally {
        setLoading(false);
      }
    };

    if (profile?.role === 'admin') {
      fetchAccesses();
    }
  }, [profile]);

  if (profile?.role !== 'admin') {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="flex h-full items-center justify-center text-app-light/60">Access Denied. Admin only.</div>
        </IonContent>
      </IonPage>
    );
  }

  const renderEntityLabel = (row: AccessRow) => {
    if (!row.entity) return row.entity_subject_id;
    if (row.entity.type === 'artist' && row.entity.artist) return row.entity.artist.name;
    if (row.entity.type === 'venue' && row.entity.venue_place) return row.entity.venue_place.name;
    if (row.entity.profile) return row.entity.profile.display_name || row.entity.profile.username || row.entity_subject_id;
    return row.entity_subject_id;
  };

  const renderEntityMeta = (row: AccessRow) => {
    if (!row.entity) return '';
    if (row.entity.type === 'artist' && row.entity.artist?.city) return row.entity.artist.city;
    if (row.entity.type === 'venue' && row.entity.venue_place?.city) return row.entity.venue_place.city;
    return '';
  };

  return (
    <AppShell
      headerProps={{ title: 'Access Grants', showBack: true }}
      headerPlacement="outside"
      contentClassName="ion-padding"
      contentFullscreen={false}
      contentWrapperClassName={false}
    >
      <div className="mx-auto max-w-3xl space-y-8 py-6">
        <AdminActionsNav active="list" />

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-app-light/70">Granted Accesses</h2>
              {loading && <IonSpinner name="crescent" color="light" />}
            </div>
            {error && <div className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
            {!loading && !error && rows.length === 0 && (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-app-light/70">
                No access grants found.
              </div>
            )}

            <div className="mt-4 space-y-3">
              {rows.map((row) => (
                <div
                  key={`${row.admin_subject_id}-${row.entity_subject_id}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-white/10">
                      {row.admin?.profile?.avatar_url ? (
                        <img
                          src={row.admin.profile.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-app-light/70">
                          {row.admin?.profile?.username?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-app-light">
                        {row.admin?.profile?.display_name || row.admin?.profile?.username || 'Unknown admin'}
                      </div>
                      <div className="text-xs uppercase tracking-widest text-app-light/50">{row.role}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-app-light">{renderEntityLabel(row)}</div>
                    <div className="text-xs text-app-light/60">
                      {row.entity?.type ? row.entity.type.toUpperCase() : 'Entity'} {renderEntityMeta(row) && `· ${renderEntityMeta(row)}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
      </div>
    </AppShell>
  );
};

export default AdminAccessList;

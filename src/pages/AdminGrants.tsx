import React, { useState, useEffect } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { managementService } from '../services/management.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import AdminActionsNav from '../components/admin/AdminActionsNav';

const AdminGrants: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [userQuery, setUserQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [entityQuery, setEntityQuery] = useState('');
  const [entityType, setEntityType] = useState<'artist' | 'venue'>('artist');
  const [entities, setEntities] = useState<any[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  useEffect(() => {
    if (userQuery.length > 2) {
      managementService.searchProfiles(userQuery).then(setUsers);
    } else {
      setUsers([]);
    }
  }, [userQuery]);

  useEffect(() => {
    if (entityQuery.length > 2) {
      if (entityType === 'artist') {
        managementService.searchArtists(entityQuery).then(setEntities);
      } else {
        managementService.searchVenues(entityQuery).then(setEntities);
      }
    } else {
      setEntities([]);
    }
  }, [entityQuery, entityType]);

  const handleGrant = async () => {
    if (!selectedUser || !selectedEntity) return;

    setLoading(true);
    setMessage(null);
    try {
      await managementService.adminGrantEntityAccess(
        selectedUser.id,
        entityType,
        selectedEntity.id,
        'admin'
      );
      setMessage({ type: 'success', text: 'Access granted successfully' });
      // Reset form
      setSelectedUser(null);
      setSelectedEntity(null);
      setUserQuery('');
      setEntityQuery('');
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to grant access' });
    } finally {
      setLoading(false);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="flex h-full items-center justify-center text-app-light/60">
            Access Denied. Admin only.
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <AppShell
      headerProps={{ title: 'Admin Grants', showBack: true }}
      headerPlacement="outside"
      contentClassName="ion-padding"
      contentFullscreen={false}
      contentWrapperClassName={false}
    >
      <div className="mx-auto max-w-2xl space-y-10 py-6">
        <AdminActionsNav active="grant" />

          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-app-light/70">Grant Access</h3>
            </div>
            <p className="text-sm text-app-light/70">Grant a user access to manage an artist or venue.</p>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-app-light/50">Find User</h4>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by username or display name..."
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
                />
                {users.length > 0 && !selectedUser && (
                  <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#1A1D25] shadow-xl">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedUser(u); setUserQuery(u.username || u.display_name); }}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/5"
                      >
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-app-ink/20 text-xs font-bold text-app-ink">
                            {u.username?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-app-light">{u.username}</div>
                          <div className="text-xs text-app-light/50">{u.display_name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedUser && (
                <div className="flex items-center justify-between rounded-xl bg-app-ink/10 p-3">
                  <span className="text-sm text-app-ink">Selected: <strong>{selectedUser.username}</strong></span>
                  <button onClick={() => setSelectedUser(null)} className="text-xs text-app-ink hover:underline">Clear</button>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-app-light/50">Select Entity</h4>
              <div className="flex gap-2 rounded-xl bg-white/5 p-1">
                <button
                  onClick={() => { setEntityType('artist'); setSelectedEntity(null); setEntityQuery(''); }}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${entityType === 'artist' ? 'bg-app-ink text-white' : 'text-app-light/60 hover:text-app-light'}`}
                >
                  Artist
                </button>
                <button
                  onClick={() => { setEntityType('venue'); setSelectedEntity(null); setEntityQuery(''); }}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${entityType === 'venue' ? 'bg-app-ink text-white' : 'text-app-light/60 hover:text-app-light'}`}
                >
                  Venue
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder={`Search for ${entityType}...`}
                  value={entityQuery}
                  onChange={(e) => setEntityQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
                />
                {entities.length > 0 && !selectedEntity && (
                  <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#1A1D25] shadow-xl">
                    {entities.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => { setSelectedEntity(e); setEntityQuery(e.name); }}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/5"
                      >
                        {e.image_url ? (
                          <img src={e.image_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-app-light/40">
                            {e.name[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-app-light">{e.name}</div>
                          {e.city && <div className="text-xs text-app-light/50">{e.city}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedEntity && (
                <div className="flex items-center justify-between rounded-xl bg-app-ink/10 p-3">
                  <span className="text-sm text-app-ink">Selected: <strong>{selectedEntity.name}</strong></span>
                  <button onClick={() => setSelectedEntity(null)} className="text-xs text-app-ink hover:underline">Clear</button>
                </div>
              )}
            </div>

            <div className="pt-4">
              {message && (
                <div className={`mb-4 rounded-xl p-4 text-sm font-medium ${message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {message.text}
                </div>
              )}
              <button
                disabled={!selectedUser || !selectedEntity || loading}
                onClick={handleGrant}
                className="flex w-full items-center justify-center rounded-2xl bg-app-ink py-4 font-bold text-white shadow-lg shadow-app-ink/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
              >
                {loading ? <IonSpinner name="crescent" color="light" /> : 'Grant Access'}
              </button>
            </div>
          </section>
      </div>
    </AppShell>
  );
};

export default AdminGrants;

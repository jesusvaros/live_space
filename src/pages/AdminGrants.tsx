import React, { useState, useEffect } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { managementService } from '../services/management.service';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';

const AdminGrants: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Form State
  const [userQuery, setUserQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [entityQuery, setEntityQuery] = useState('');
  const [entityType, setEntityType] = useState<'artist' | 'venue'>('artist');
  const [entities, setEntities] = useState<any[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  const [role, setRole] = useState<'owner' | 'admin' | 'editor' | 'moderator'>('admin');

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
        role
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
    <IonPage>
      <AppHeader title="Admin Grants" showBack />
      <IonContent className="ion-padding">
        <div className="mx-auto max-w-lg space-y-8 py-6">
          {/* User Selection */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-app-light/50">1. Find User</h3>
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
          </section>

          {/* Entity Selection */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-app-light/50">2. Select Entity</h3>
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
              <button
                onClick={() => { setEntityType('artist'); setSelectedEntity(null); setEntityQuery(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${entityType === 'artist' ? 'bg-app-ink text-white' : 'text-app-light/60 hover:text-app-light'}`}
              >
                Artist
              </button>
              <button
                onClick={() => { setEntityType('venue'); setSelectedEntity(null); setEntityQuery(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${entityType === 'venue' ? 'bg-app-ink text-white' : 'text-app-light/60 hover:text-app-light'}`}
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
          </section>

          {/* Role Selection */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-app-light/50">3. Assign Role</h3>
            <div className="grid grid-cols-2 gap-2">
              {['owner', 'admin', 'editor', 'moderator'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r as any)}
                  className={`py-3 rounded-xl border text-sm font-medium transition-all ${role === r ? 'border-app-ink bg-app-ink text-white' : 'border-white/10 bg-white/5 text-app-light/60 hover:border-white/20'}`}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </section>

          {/* Action */}
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
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminGrants;

import React from 'react';
import { ManagedEntity, PostWithSetlist, ProfileRole } from '../../lib/types';

interface ProfileStatsProps {
  posts: PostWithSetlist[];
  isManagementMode: boolean;
  activeEntity: ManagedEntity | null;
  role: ProfileRole | undefined;
  isVerified: boolean;
}

const ProfileStats: React.FC<ProfileStatsProps> = ({
  posts,
  isManagementMode,
  activeEntity,
  role,
  isVerified,
}) => {
  const stats = [
    { label: 'Posts', value: posts.length.toString() },
    { 
      label: 'Role', 
      value: isManagementMode && activeEntity 
        ? activeEntity.type.charAt(0).toUpperCase() + activeEntity.type.slice(1)
        : role || 'user' 
    },
    { 
      label: 'Verified', 
      value: isManagementMode && activeEntity 
        ? (activeEntity.type === 'artist' ? 'Yes' : 'No')
        : isVerified ? 'Yes' : 'No' 
    },
  ];

  return (
    <div
      className="grid grid-cols-3 gap-3 text-center animate-fade-up motion-reduce:animate-none"
      style={{ animationDelay: '0.08s' }}
    >
      {stats.map(stat => (
        <div
          key={stat.label}
          className="rounded-2xl bg-slate-900/70 px-2 py-3 text-sm shadow-sm"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{stat.label}</p>
          <p className="mt-2 font-display text-lg text-slate-50">{stat.value}</p>
        </div>
      ))}
    </div>
  );
};

export default ProfileStats;

import React from 'react';

type AdminNavActive = 'grant' | 'artist' | 'venue' | 'list';

interface AdminActionsNavProps {
  active: AdminNavActive;
}

const links: Array<{ key: AdminNavActive; label: string; href: string }> = [
  { key: 'grant', label: 'Grant Access', href: '/admin/grants' },
  { key: 'artist', label: 'Create Artist', href: '/admin/create-artist' },
  { key: 'venue', label: 'Create Venue', href: '/admin/create-venue' },
  { key: 'list', label: 'View Access Grants', href: '/admin/access-grants' }
];

const AdminActionsNav: React.FC<AdminActionsNavProps> = ({ active }) => {
  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 sm:grid-cols-2">
      {links.map((item) => {
        const isActive = item.key === active;
        return (
          <a
            key={item.key}
            href={item.href}
            className={`flex min-h-[72px] items-center justify-center rounded-xl border px-4 py-3 text-base font-semibold uppercase tracking-[0.12em] transition ${
              isActive
                ? 'border-app-ink bg-app-ink text-white shadow-lg shadow-app-ink/30'
                : 'border-white/10 bg-white/5 text-app-light/80 hover:border-app-ink/40 hover:text-white'
            }`}
          >
            {item.label}
          </a>
        );
      })}
    </div>
  );
};

export default AdminActionsNav;

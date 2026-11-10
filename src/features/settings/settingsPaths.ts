// Ajustes routes, apart from the screen so the back-button handler can use
// them without loading the settings chunk.

export const SETTINGS_SECTIONS = {
  perfil: { title: 'Perfil', back: '/ajustes' },
  gestion: { title: 'Gestión', back: '/ajustes' },
  notificaciones: { title: 'Notificaciones', back: '/ajustes' },
  privacidad: { title: 'Privacidad', back: '/ajustes' },
  bloqueados: { title: 'Usuarios bloqueados', back: '/ajustes/privacidad' },
  'ocultos-mapa': { title: 'Ocultos del mapa', back: '/ajustes/privacidad' },
  cuenta: { title: 'Cuenta', back: '/ajustes' },
  legal: { title: 'Legal', back: '/ajustes' },
  acerca: { title: 'Acerca de', back: '/ajustes' },
} as const;

export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

export const isSettingsSection = (value: string | undefined): value is SettingsSection =>
  Boolean(value) && Object.prototype.hasOwnProperty.call(SETTINGS_SECTIONS, value as string);

/** Where back goes from a settings path: section → its list, list → profile; null elsewhere. */
export const settingsParentPath = (pathname: string): string | null => {
  const match = /^\/ajustes(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!match) return null;
  if (!match[1]) return '/tabs/profile';
  return isSettingsSection(match[1]) ? SETTINGS_SECTIONS[match[1]].back : '/ajustes';
};

import { describe, expect, it } from 'vitest';
import { isSettingsSection, settingsParentPath } from './settingsPaths';

describe('settingsParentPath (Android back from Ajustes)', () => {
  it('goes from a section to its list and from the list to the profile', () => {
    expect(settingsParentPath('/ajustes')).toBe('/tabs/profile');
    expect(settingsParentPath('/ajustes/cuenta')).toBe('/ajustes');
    expect(settingsParentPath('/ajustes/bloqueados')).toBe('/ajustes/privacidad');
    expect(settingsParentPath('/ajustes/ocultos-mapa/')).toBe('/ajustes/privacidad');
  });

  it('sends unknown sections to the list and ignores other paths', () => {
    expect(settingsParentPath('/ajustes/nada')).toBe('/ajustes');
    expect(settingsParentPath('/tabs/profile')).toBeNull();
    expect(isSettingsSection('toString')).toBe(false);
  });
});

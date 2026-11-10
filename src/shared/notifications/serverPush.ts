// Who sends «¿Subes lo de anoche?» and «Nuevo concierto de…» on this device
// (docs/notificaciones.md, «Push del servidor y avisos locales»).
//
// Once this device's push token is saved in push_devices for the signed-in
// person, the hourly server sender owns those notices and the app stops
// scheduling the local equivalents, so nothing arrives twice. Devices without
// a saved token (iOS until there is APNs, a failed registration, the web)
// keep the local ones. Cleared on sign out and whenever saving fails.

const KEY = 'live_space.push.server_owned.v1';

export const setServerPushActive = (active: boolean) => {
  try {
    if (active) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // No storage: the local notices keep running, at worst a duplicate.
  }
};

export const isServerPushActive = () => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

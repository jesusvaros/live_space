// The account sheet is mounted once (AuthSheetHost in App) and opened from
// anywhere: a tap on something that needs an account (askForAccount) or a
// gentle nudge while watching moments. It slides up over the current screen,
// can always be dismissed, and closes by itself once the session lands.

export type AuthSheetRequest = {
  // One line saying why, e.g. «Crea tu cuenta para seguir a Frisbi».
  reason: string;
  // For analytics: what opened it (follow, save, like, attend, reels…).
  source: string;
};

type Listener = (request: AuthSheetRequest) => void;

let listener: Listener | null = null;

export const registerAuthSheet = (next: Listener) => {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
};

/** Opens the sheet; false when it is not mounted (then use /welcome). */
export const openAuthSheet = (request: AuthSheetRequest) => {
  if (!listener) return false;
  listener(request);
  return true;
};

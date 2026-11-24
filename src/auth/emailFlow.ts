import type { AuthError } from '@supabase/supabase-js';

// One email box for everyone: «Continuar» signs in, and if there is no
// account with that email it creates one. No «Crear cuenta / Ya tengo
// cuenta» switch and nothing else to fill in (the @username is made on the
// server; name, city and photo come later, when they are useful).

export type EmailOutcome =
  | { kind: 'signed-in' }
  | { kind: 'signed-up' }
  | { kind: 'confirmation-sent' }
  | { kind: 'wrong-password' }
  | { kind: 'error'; message: string };

type Deps = {
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null; hasSession: boolean; existingAccount: boolean }>;
};

export const MIN_PASSWORD = 6;

export const validateEmailForm = (email: string, password: string): string | null => {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'Escribe tu email.';
  if (password.length < MIN_PASSWORD) return `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`;
  return null;
};

export const continueWithEmail = async (deps: Deps, rawEmail: string, password: string): Promise<EmailOutcome> => {
  const email = rawEmail.trim().toLowerCase();
  const signedIn = await deps.signIn(email, password);
  if (!signedIn.error) return { kind: 'signed-in' };
  // Anything but «wrong email or password» is a real error (unconfirmed
  // email, too many tries…): say it instead of creating an account.
  if (!/invalid login credentials/i.test(signedIn.error.message)) return { kind: 'error', message: signedIn.error.message };

  const created = await deps.signUp(email, password);
  if (created.error) {
    if (/already registered|already been registered/i.test(created.error.message)) return { kind: 'wrong-password' };
    return { kind: 'error', message: created.error.message };
  }
  if (created.existingAccount) return { kind: 'wrong-password' };
  return created.hasSession ? { kind: 'signed-up' } : { kind: 'confirmation-sent' };
};

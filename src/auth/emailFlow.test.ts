import { describe, expect, it, vi } from 'vitest';
import type { AuthError } from '@supabase/supabase-js';
import { continueWithEmail, validateEmailForm } from './emailFlow';

const err = (message: string) => ({ message } as AuthError);

const deps = (signIn: AuthError | null, signUp: { error: AuthError | null; hasSession?: boolean; existingAccount?: boolean } = { error: null }) => ({
  signIn: vi.fn(async () => ({ error: signIn })),
  signUp: vi.fn(async () => ({ error: signUp.error, hasSession: Boolean(signUp.hasSession), existingAccount: Boolean(signUp.existingAccount) })),
});

describe('validateEmailForm', () => {
  it('asks for a real email and a 6+ password', () => {
    expect(validateEmailForm('nope', '123456')).toMatch(/email/);
    expect(validateEmailForm('a@b.co', '123')).toMatch(/6/);
    expect(validateEmailForm(' a@b.co ', '123456')).toBeNull();
  });
});

describe('continueWithEmail', () => {
  it('signs in when the account exists', async () => {
    const d = deps(null);
    expect(await continueWithEmail(d, 'A@B.co', 'secret1')).toEqual({ kind: 'signed-in' });
    expect(d.signIn).toHaveBeenCalledWith('a@b.co', 'secret1');
    expect(d.signUp).not.toHaveBeenCalled();
  });

  it('creates the account when there is none (confirmation by email)', async () => {
    const d = deps(err('Invalid login credentials'));
    expect(await continueWithEmail(d, 'a@b.co', 'secret1')).toEqual({ kind: 'confirmation-sent' });
  });

  it('creates the account and enters when no confirmation is needed', async () => {
    const d = deps(err('Invalid login credentials'), { error: null, hasSession: true });
    expect(await continueWithEmail(d, 'a@b.co', 'secret1')).toEqual({ kind: 'signed-up' });
  });

  it('says wrong password when the email already has an account', async () => {
    expect(await continueWithEmail(deps(err('Invalid login credentials'), { error: null, existingAccount: true }), 'a@b.co', 'x12345')).toEqual({ kind: 'wrong-password' });
    expect(await continueWithEmail(deps(err('Invalid login credentials'), { error: err('User already registered') }), 'a@b.co', 'x12345')).toEqual({ kind: 'wrong-password' });
  });

  it('does not create an account on other sign-in errors', async () => {
    const d = deps(err('Email not confirmed'));
    expect(await continueWithEmail(d, 'a@b.co', 'secret1')).toEqual({ kind: 'error', message: 'Email not confirmed' });
    expect(d.signUp).not.toHaveBeenCalled();
  });
});

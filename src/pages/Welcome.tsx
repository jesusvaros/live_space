import React, { useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';

const Welcome: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [primaryCity, setPrimaryCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const history = useHistory();
  const { signIn, signUp, sendPasswordReset } = useAuth();

  const handleAuth = async () => {
    setLoading(true);
    setError('');

    try {
      if (!email || !password || (isSignUp && !username)) {
        setError('Please fill in all required fields');
        return;
      }

      if (isSignUp) {
        const { error: signUpError } = await signUp(email, password, {
          username,
          displayName,
          primaryCity,
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
      } else {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          setError(signInError.message);
          return;
        }
      }

      history.replace('/tabs/events');
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setLoading(true);
    setError('');
    setResetSent(false);

    try {
      const emailToSend = resetEmail || email;
      if (!emailToSend) {
        setError('Enter your email to reset password');
        return;
      }

      const { error: resetError } = await sendPasswordReset(emailToSend);
      if (resetError) {
        setError(resetError.message);
        return;
      }

      setResetSent(true);
    } catch (err) {
      setError('Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="app-layout">
          <AppHeader />
          <div className="app-screen">
            <div className="relative min-h-full">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 right-0 h-48 w-48 rounded-full bg-[radial-gradient(circle_at_top,_#38bdf8_0%,_transparent_70%)] opacity-60 blur-2xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-32 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_top,_#f97316_0%,_transparent_70%)] opacity-40 blur-2xl"
              />

              <div className="mx-auto max-w-md text-center fade-up">
                <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Local moments</p>
                <h1 className="mt-4 font-display text-4xl leading-tight text-slate-50">
                  Live Space
                </h1>
                <p className="mt-3 text-sm text-slate-400">
                  Discover gigs, capture the crowd, and share what is happening tonight.
                </p>
              </div>

              <div className="app-card mt-8 space-y-4 p-5 fade-up fade-up-delay-1">
                <h2 className="font-display text-base font-semibold text-slate-50">
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </h2>
                <div className="space-y-3">
                  {isSignUp && (
                    <>
                      <label className="app-field">
                        <span className="app-label">Username</span>
                        <input
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          placeholder="Choose a username"
                          className="app-input"
                        />
                      </label>
                      <label className="app-field">
                        <span className="app-label">Display name</span>
                        <input
                          value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          placeholder="How should we call you?"
                          className="app-input"
                        />
                      </label>
                      <label className="app-field">
                        <span className="app-label">Primary city</span>
                        <input
                          value={primaryCity}
                          onChange={e => setPrimaryCity(e.target.value)}
                          placeholder="Barcelona"
                          className="app-input"
                        />
                      </label>
                    </>
                  )}

                  <label className="app-field">
                    <span className="app-label">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="app-input"
                    />
                  </label>
                  <label className="app-field">
                    <span className="app-label">Password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="app-input"
                    />
                  </label>
                </div>

                {error && <p className="text-sm text-rose-400">{error}</p>}

                <button
                  type="button"
                  className="app-button app-button--block"
                  onClick={handleAuth}
                  disabled={loading || !email || !password || (isSignUp && !username)}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <IonSpinner name="crescent" />
                      Loading...
                    </span>
                  ) : isSignUp ? (
                    'Sign Up'
                  ) : (
                    'Sign In'
                  )}
                </button>

                <button
                  type="button"
                  className="app-button app-button--ghost app-button--block"
                  onClick={() => setIsSignUp(!isSignUp)}
                >
                  {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>

                {!isSignUp && (
                  <button
                    type="button"
                    className="app-button app-button--ghost app-button--block"
                    onClick={() => setShowReset(prev => !prev)}
                  >
                    Forgot your password?
                  </button>
                )}

                {showReset && (
                  <div className="space-y-3 rounded-2xl bg-slate-900/60 p-4">
                    <label className="app-field">
                      <span className="app-label">Reset email</span>
                      <input
                        type="email"
                        value={resetEmail || email}
                        onChange={e => setResetEmail(e.target.value)}
                        placeholder="you@email.com"
                        className="app-input"
                      />
                    </label>
                    <button
                      type="button"
                      className="app-button app-button--block"
                      onClick={handlePasswordReset}
                      disabled={loading}
                    >
                      Send reset link
                    </button>
                    {resetSent && (
                      <p className="text-sm text-emerald-400">Check your inbox for the reset link.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Welcome;

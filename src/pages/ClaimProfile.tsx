import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { Spinner } from '../components/ui/AppPrimitives';
import { useAuth } from '../contexts/AuthContext';
import {
  claimsService,
  ClaimEntityType,
  ClaimTarget,
  ClaimVerificationMethod,
  EntityClaim,
} from '../services/claims.service';
import { canGoBack } from '../app/useGoBack';

const ROLES: Record<ClaimEntityType, string[]> = {
  artist: ['Soy el artista o miembro del grupo', 'Management', 'Sello o discográfica', 'Comunicación o prensa', 'Booking'],
  venue: ['Programación', 'Dirección', 'Comunicación', 'Producción', 'Propiedad de la sala'],
  festival: ['Organización', 'Dirección', 'Programación', 'Comunicación o prensa', 'Producción'],
};

const fieldClass =
  'min-h-12 w-full rounded-xl border border-app-line bg-app-surface px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none';

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const statusCopy: Record<EntityClaim['status'], { title: string; body: string }> = {
  pending: {
    title: 'Solicitud enviada',
    body: 'Una persona del equipo de Live Space revisa cada solicitud. Mientras tanto, el perfil sigue igual.',
  },
  approved: {
    title: 'Solicitud aprobada',
    body: 'Ya puedes gestionar este perfil desde el panel de gestión.',
  },
  rejected: {
    title: 'Solicitud rechazada',
    body: 'No hemos podido verificarlo. Escríbenos si crees que es un error.',
  },
};

const ClaimProfile: React.FC = () => {
  const { type: rawType, id } = useParams();
  const type: ClaimEntityType = rawType === 'venue' || rawType === 'festival' ? rawType : 'artist';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [target, setTarget] = useState<ClaimTarget | null>(null);
  const [claim, setClaim] = useState<EntityClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [step, setStep] = useState(1);
  const [role, setRole] = useState(ROLES[type][0]);
  const [method, setMethod] = useState<ClaimVerificationMethod>('email_domain');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const nextTarget = await claimsService.getTarget(type, id);
        if (cancelled) return;
        setTarget(nextTarget);
        if (nextTarget?.instagram) setInstagram(nextTarget.instagram);
        if (nextTarget && user?.id) {
          const existing = await claimsService.getMyClaim(nextTarget.subjectId, user.id);
          if (!cancelled) setClaim(existing);
        }
      } catch {
        if (!cancelled) setLoadError('No se ha podido cargar el perfil.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, type, user?.id]);

  const close = () => {
    if (canGoBack()) navigate(-1);
    else navigate(id ? `/tabs/${type}/${id}` : '/tabs/events', { replace: true });
  };

  const domain = target?.officialDomain ?? null;
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const emailMatchesDomain = !domain || email.trim().toLowerCase().endsWith(`@${domain}`) ||
    email.trim().toLowerCase().endsWith(`.${domain}`);

  const stepError = useMemo(() => {
    if (step === 1 && role.trim().length < 2) return 'Dinos cuál es tu papel.';
    if (step === 2) {
      if (!emailValid) return 'Escribe un email válido.';
      if (method === 'email_domain' && !emailMatchesDomain) return `El email tiene que ser del dominio oficial (@${domain}).`;
      if (method === 'instagram_code' && !instagram.trim()) return 'Escribe la cuenta oficial de Instagram.';
    }
    return '';
  }, [step, role, emailValid, method, emailMatchesDomain, domain, instagram]);

  const next = async () => {
    setError('');
    if (stepError) {
      setError(stepError);
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    if (!target || !user) return;
    setSubmitting(true);
    try {
      const created = await claimsService.createClaim({
        subjectId: target.subjectId,
        claimantId: user.id,
        claimantRole: role,
        method,
        contactEmail: email,
        instagramHandle: method === 'instagram_code' ? instagram : null,
        message,
      });
      setClaim(created);
    } catch (err: any) {
      setError(err?.message || 'No se ha podido enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const kindLabel = type === 'venue' ? 'sala' : type === 'festival' ? 'festival' : 'artista';

  const renderHeaderEntity = () =>
    target ? (
      <div className="flex items-center gap-3">
        <Avatar name={target.name} src={target.imageUrl} rounded="xl" className="h-14 w-14 text-[22px]" />
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase text-app-accent">Reclamar {kindLabel}</p>
          <h1 className="mt-0.5 truncate font-poster text-[36px] leading-[0.9] text-app-ink">{target.name}</h1>
        </div>
      </div>
    ) : null;

  const renderStatus = (existing: EntityClaim) => {
    const copy = statusCopy[existing.status];
    return (
      <div className="flex flex-col gap-5 px-4 pt-5">
        {renderHeaderEntity()}
        <section className="rounded-2xl border border-app-line bg-app-surface p-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-300">
            {existing.status === 'pending' ? 'Pendiente de verificación' : existing.status === 'approved' ? 'Verificado' : 'Rechazada'}
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-app-ink">{copy.title}</h2>
          <p className="mt-1 text-sm text-white/70">{copy.body}</p>
          {existing.status === 'pending' ? (
            <div className="mt-4 rounded-xl border border-dashed border-app-line p-3">
              <p className="text-[13px] text-white/70">
                {existing.verification_method === 'instagram_code'
                  ? `Publica este código en una historia o en la bio de @${existing.instagram_handle} y déjalo hasta que te confirmemos:`
                  : `Te escribiremos a ${existing.contact_email}. Responde citando este código:`}
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.18em] text-app-ink">LS-{existing.verification_code}</p>
            </div>
          ) : null}
          {existing.review_note && existing.status !== 'pending' ? (
            <p className="mt-3 text-sm text-white/60">Nota del equipo: {existing.review_note}</p>
          ) : null}
        </section>
        {existing.status === 'approved' ? (
          <Button onClick={() => navigate('/gestion')} size="lg" block>
            Ir al panel de gestión
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex h-dvh flex-col bg-app-bg text-app-ink">
      <header className="flex items-center gap-2 px-3 pb-1 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
        >
          <CloseIcon />
        </button>
        {!claim && target ? (
          <span className="flex-1 text-right font-mono text-xs font-semibold text-white/50">PASO {step} DE 3</span>
        ) : null}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto pb-6">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : loadError || !target ? (
          <p className="px-4 pt-8 text-sm text-rose-300">{loadError || 'Este perfil no existe.'}</p>
        ) : claim && (claim.status === 'pending' || claim.status === 'approved') ? (
          renderStatus(claim)
        ) : (
          <div className="flex flex-col gap-5 px-4 pt-5">
            {renderHeaderEntity()}

            {claim?.status === 'rejected' && step === 1 ? (
              <p className="rounded-xl bg-app-surface p-3 text-[13px] text-white/70">
                Tu solicitud anterior fue rechazada{claim.review_note ? `: ${claim.review_note}` : '.'} Puedes enviar otra.
              </p>
            ) : null}

            {step === 1 ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Tu papel</span>
                <select className={fieldClass} value={role} onChange={event => setRole(event.target.value)}>
                  {ROLES[type].map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <span className="text-[13px] text-white/55">
                  Con el perfil verificado podrás corregir horarios, subir el cartel, publicar el setlist y poner un QR en el concierto.
                </span>
              </label>
            ) : null}

            {step === 2 ? (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 font-display text-base font-bold">¿Cómo lo verificamos?</legend>
                  {([
                    {
                      value: 'email_domain' as const,
                      title: 'Email del dominio oficial',
                      body: domain
                        ? `Te escribimos a una dirección @${domain}`
                        : 'Te escribimos a una dirección del dominio oficial de la web',
                    },
                    {
                      value: 'instagram_code' as const,
                      title: 'Código en Instagram',
                      body: 'Publica un código en la cuenta oficial y lo comprobamos',
                    },
                  ]).map(option => {
                    const selected = method === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer gap-3 rounded-2xl p-3.5 ${
                          selected ? 'border-2 border-app-accent bg-app-accent/[0.08]' : 'border border-app-line bg-app-surface'
                        }`}
                      >
                        <input
                          type="radio"
                          name="metodo"
                          value={option.value}
                          checked={selected}
                          onChange={() => setMethod(option.value)}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-[#ff5b2e]"
                        />
                        <span>
                          <span className="block font-semibold">{option.title}</span>
                          <span className="text-[13px] text-white/70">{option.body}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">{method === 'email_domain' ? 'Email profesional' : 'Email de contacto'}</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className={fieldClass}
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder={domain ? `nombre@${domain}` : 'nombre@dominio.com'}
                  />
                </label>

                {method === 'instagram_code' ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold">Cuenta oficial de Instagram</span>
                    <input
                      className={fieldClass}
                      value={instagram}
                      onChange={event => setInstagram(event.target.value)}
                      placeholder="@cuenta"
                      autoCapitalize="none"
                    />
                  </label>
                ) : null}
              </>
            ) : null}

            {step === 3 ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Mensaje para el equipo <span className="font-normal text-white/50">(opcional)</span></span>
                <textarea
                  className={`${fieldClass} min-h-32 py-3`}
                  value={message}
                  maxLength={1000}
                  onChange={event => setMessage(event.target.value)}
                  placeholder="Cualquier cosa que nos ayude a verificarlo"
                />
              </label>
            ) : null}

            <p className="rounded-xl bg-app-surface px-3.5 py-3 text-[13px] text-white/70">
              Una persona del equipo de Live Space revisa cada solicitud. Mientras tanto, el perfil sigue igual.
            </p>

            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
          </div>
        )}
      </main>

      {!loading && target && !(claim && (claim.status === 'pending' || claim.status === 'approved')) ? (
        <footer className="flex gap-2 border-t border-app-line bg-app-bg/95 px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-2.5">
          {step > 1 ? (
            <Button variant="secondary" size="lg" onClick={() => { setError(''); setStep(step - 1); }}>
              Atrás
            </Button>
          ) : null}
          <Button size="lg" block className="flex-1" onClick={next} disabled={submitting}>
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {step < 3 ? 'Continuar' : 'Enviar solicitud'}
          </Button>
        </footer>
      ) : null}
    </div>
  );
};

export default ClaimProfile;

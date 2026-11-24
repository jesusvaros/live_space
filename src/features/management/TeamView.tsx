import React, { useState } from 'react';
import Avatar from '../../components/ui/Avatar';
import { IconCopy, IconShare, IconTrash } from '../../components/icons';
import type { TeamInvite, TeamMember } from '../../services/team.service';
import { ROLE_HINTS, ROLE_LABELS, type MemberRole, linkStatus } from './profileForm';
import { copyLink, mailtoInvite, shareLink } from './shareLink';

// Team of an artist or venue: who is in it and with which role, and a
// one-time link to invite someone (shared by WhatsApp or mail: we do not
// send mail yet). Owners and admins manage; everyone else only sees.

type InviteRole = Exclude<MemberRole, 'owner'>;
const INVITE_ROLES: InviteRole[] = ['editor', 'moderator', 'admin'];

type Props = {
  entityName: string;
  members: TeamMember[];
  invites: TeamInvite[];
  currentUserId: string | null;
  canAdmin: boolean;
  onCreateInvite: (role: InviteRole, email: string) => Promise<string>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onChangeRole: (profileId: string, role: InviteRole) => Promise<void>;
  onRemove: (profileId: string) => Promise<void>;
};

const sectionTitle = 'mb-2 mt-7 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');

const TeamView: React.FC<Props> = ({
  entityName,
  members,
  invites,
  currentUserId,
  canAdmin,
  onCreateInvite,
  onRevokeInvite,
  onChangeRole,
  onRemove,
}) => {
  const [role, setRole] = useState<InviteRole>('editor');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setNote(null);
    try {
      await action();
    } catch (err) {
      setNote({ kind: 'error', text: err instanceof Error ? err.message : 'Algo ha fallado.' });
    }
  };

  const create = async () => {
    setBusy(true);
    await run(async () => {
      const url = await onCreateInvite(role, email);
      setLink({ url, email: email.trim() });
      setEmail('');
    });
    setBusy(false);
  };

  const inviteText = `Te invito a gestionar ${entityName} en Live Space`;
  const openInvites = invites.filter(invite => linkStatus({ used_at: invite.acceptedAt, revoked_at: invite.revokedAt, expires_at: invite.expiresAt }) === 'open');

  return (
    <div className="pt-2">
      {note ? (
        <p role="alert" className={`mb-3 text-[13px] ${note.kind === 'error' ? 'text-rose-300' : 'text-white/70'}`}>
          {note.text}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2" aria-label="Equipo">
        {members.map(member => {
          const name = member.displayName || (member.username ? `@${member.username}` : 'Sin nombre');
          const isMe = member.profileId === currentUserId;
          const editable = canAdmin && member.role !== 'owner' && !isMe;
          return (
            <li key={member.profileId} className="flex min-h-16 items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-3 py-2.5">
              <Avatar name={name} src={member.avatarUrl} className="h-10 w-10 text-base" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-app-ink">
                  {name}
                  {isMe ? <span className="font-normal text-white/50"> · tú</span> : null}
                </p>
                {member.username && member.displayName ? (
                  <p className="truncate text-[12px] text-white/50">@{member.username}</p>
                ) : null}
              </div>
              {editable ? (
                confirmRemove === member.profileId ? (
                  <button
                    type="button"
                    onClick={() => run(async () => {
                      await onRemove(member.profileId);
                      setConfirmRemove(null);
                    })}
                    className="min-h-10 shrink-0 rounded-full bg-rose-500/15 px-3.5 text-[13px] font-semibold text-rose-200"
                  >
                    Quitar
                  </button>
                ) : (
                  <>
                    <label className="shrink-0">
                      <span className="sr-only">Rol de {name}</span>
                      <select
                        value={member.role}
                        onChange={event => run(() => onChangeRole(member.profileId, event.target.value as InviteRole))}
                        className="min-h-10 appearance-none rounded-full border border-app-line bg-transparent px-3 text-[13px] font-semibold text-app-ink"
                      >
                        {INVITE_ROLES.map(option => (
                          <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      aria-label={`Quitar a ${name}`}
                      onClick={() => setConfirmRemove(member.profileId)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/55"
                    >
                      <IconTrash size={18} />
                    </button>
                  </>
                )
              ) : (
                <span className="shrink-0 rounded-full border border-app-line px-3 py-1.5 text-[12px] font-semibold text-white/70">
                  {ROLE_LABELS[member.role]}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {canAdmin ? (
        <>
          <h2 className={sectionTitle}>Invitar</h2>
          <div role="radiogroup" aria-label="Rol" className="grid grid-cols-3 gap-2">
            {INVITE_ROLES.map(option => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={role === option}
                onClick={() => setRole(option)}
                className={`flex min-h-[72px] flex-col items-start gap-1 rounded-2xl border p-3 text-left ${
                  role === option ? 'border-app-ink bg-app-ink text-app-bg' : 'border-app-line bg-app-surface text-app-ink'
                }`}
              >
                <span className="text-[14px] font-bold">{ROLE_LABELS[option]}</span>
                <span className={`text-[11px] leading-tight ${role === option ? 'text-app-bg/70' : 'text-white/50'}`}>{ROLE_HINTS[option]}</span>
              </button>
            ))}
          </div>
          <input
            type="email"
            inputMode="email"
            autoCapitalize="off"
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="Email (opcional)"
            aria-label="Email de la persona"
            className="mt-2 min-h-12 w-full rounded-xl border border-app-line bg-app-surface px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-ink/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="mt-3 min-h-12 w-full rounded-full bg-app-ink text-[15px] font-bold text-app-bg disabled:opacity-50"
          >
            {busy ? 'Creando…' : 'Crear enlace'}
          </button>

          {link ? (
            <div className="mt-3 rounded-2xl border border-dashed border-white/25 p-3">
              <p className="break-all font-mono text-[12px] text-white/70">{link.url}</p>
              <p className="mt-1 text-[12px] text-white/45">Un solo uso · caduca en 7 días</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => shareLink(link.url, inviteText).then(result => result === 'copied' && setNote({ kind: 'ok', text: 'Enlace copiado' }))}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-app-ink px-4 text-[13px] font-bold text-app-bg"
                >
                  <IconShare size={16} /> Compartir
                </button>
                <button
                  type="button"
                  onClick={() => copyLink(link.url).then(ok => setNote(ok ? { kind: 'ok', text: 'Enlace copiado' } : { kind: 'error', text: 'No se ha podido copiar.' }))}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-app-line px-4 text-[13px] font-semibold text-app-ink"
                >
                  <IconCopy size={16} /> Copiar
                </button>
                {link.email ? (
                  <a
                    href={mailtoInvite(link.email, inviteText, `${inviteText}: ${link.url}`)}
                    className="inline-flex min-h-10 items-center rounded-full border border-app-line px-4 text-[13px] font-semibold text-app-ink"
                  >
                    Enviar por email
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {openInvites.length ? (
            <>
              <h2 className={sectionTitle}>Enlaces sin usar</h2>
              <ul className="flex flex-col gap-2">
                {openInvites.map(invite => (
                  <li key={invite.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed border-app-line px-3">
                    <span className="flex-1 text-[13px] text-white/70">
                      <strong className="text-app-ink">{ROLE_LABELS[invite.role]}</strong>
                      {invite.email ? ` · ${invite.email}` : ''} · hasta {shortDate(invite.expiresAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => run(() => onRevokeInvite(invite.id))}
                      className="min-h-10 px-2 text-[13px] font-semibold text-white/60"
                    >
                      Anular
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default TeamView;

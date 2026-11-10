// Scheduled push notices (docs/notificaciones.md). Run every hour by
// .github/workflows/send-notifications.yml.
//
//   npm run notifications:send                    → dry run: what would be sent, per type
//   npm run notifications:send -- --apply         → sends (FIREBASE_SERVICE_ACCOUNT required)
//
// Options:
//   --only=<type>     concert_day | upload_reminder | merch_pickup | followed_new_concert
//   --profile=<uuid>  only this person (e.g. a test on your own account)
//   --limit=<n>       at most n notices sent in this run (default 500)
//
// For each notice: claim its dedupe key in notifications_sent (insert … on
// conflict do nothing) BEFORE sending, so two runs never send it twice; then
// FCM to every active device. Dead tokens get push_devices.disabled_at.

import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { buildCandidates } from '../notifications/candidates.js';
import {
  createAccessTokenProvider,
  createSender,
  deliver,
  parseServiceAccount,
  rowAction,
  type FetchLike,
  type Sender,
} from '../notifications/fcm.js';
import { decide, userTimezone, type Decision } from '../notifications/policy.js';
import { loadSenderData } from '../notifications/load.js';
import { SENDER_TYPES, type Notice, type SenderType } from '../notifications/types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger(env.logLevel, { script: 'sendNotifications' });

const readArg = (name: string) => {
  const args = process.argv.slice(2);
  const inline = args.find(arg => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  const next = index >= 0 ? args[index + 1] : undefined;
  return next && !next.startsWith('--') ? next : undefined;
};

const flags = process.argv.slice(2);
const apply = flags.includes('--apply') && !flags.includes('--dry-run');
const onlyArg = readArg('only')?.trim() || undefined;
const profileArg = readArg('profile')?.trim() || undefined;
const limitArg = Number(readArg('limit'));
const limit = Number.isInteger(limitArg) && limitArg > 0 ? Math.min(limitArg, 5000) : 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const redactId = (id: string) => `${id.slice(0, 4)}…`;

const run = async () => {
  if (onlyArg && !SENDER_TYPES.includes(onlyArg as SenderType)) {
    throw new Error(`--only must be one of ${SENDER_TYPES.join(', ')}`);
  }
  if (profileArg && !UUID.test(profileArg)) throw new Error('--profile must be a profile uuid');
  const only = onlyArg as SenderType | undefined;

  const supabase = getSupabaseAdmin();
  const now = new Date();

  let loaded;
  try {
    loaded = await loadSenderData(supabase, { now, profileId: profileArg ?? null });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === '42P01' || code === 'PGRST205') {
      logger.warn('push tables do not exist yet (migration 20261110080100 not applied); nothing to do');
      return;
    }
    throw error;
  }
  logger.info('Loaded', { ...loaded.stats, users: loaded.users.length, apply, only: only ?? 'all', profile: profileArg ? redactId(profileArg) : 'all' });

  // Decide per person.
  const decisions: Decision[] = [];
  for (const user of loaded.users) {
    const timezone = userTimezone(user.devices);
    const notices = buildCandidates({ user, timezone, now, events: loaded.events, newEvents: loaded.newEvents }).filter(
      notice => !only || notice.type === only,
    );
    decisions.push(...decide({ notices, devices: user.devices, prefs: user.prefs, sent: user.sent, timezone, now }));
  }

  // Report.
  const byType: Record<string, { candidates: number; send: number; skipped: Record<string, number> }> = {};
  for (const type of SENDER_TYPES) byType[type] = { candidates: 0, send: 0, skipped: {} };
  for (const decision of decisions) {
    const entry = byType[decision.notice.type];
    entry.candidates += 1;
    if (decision.send) entry.send += 1;
    else entry.skipped[decision.reason] = (entry.skipped[decision.reason] ?? 0) + 1;
  }
  for (const type of SENDER_TYPES) {
    if (only && type !== only) continue;
    const samples = decisions
      .filter(decision => decision.notice.type === type)
      .sort((left, right) => Number(right.send) - Number(left.send))
      .slice(0, 5)
      .map(decision => ({
        profile: redactId(decision.notice.profileId),
        decision: decision.send ? 'send' : decision.reason,
        title: decision.notice.title,
        body: decision.notice.body,
        route: decision.notice.route,
      }));
    logger.info(`Type ${type}`, { ...byType[type], samples });
  }

  const toSend = decisions.filter((decision): decision is Extract<Decision, { send: true }> => decision.send).map(d => d.notice);
  if (!apply) {
    logger.info('Dry run: nothing sent. Use --apply to send.', { wouldSend: Math.min(toSend.length, limit) });
    return;
  }
  if (toSend.length === 0) {
    logger.info('Nothing to send');
    return;
  }

  const account = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  const fetchImpl = fetch as unknown as FetchLike;
  const send: Sender = createSender({
    projectId: account.projectId,
    fetchImpl,
    getAccessToken: createAccessTokenProvider(account, fetchImpl),
  });
  const devicesByUser = new Map(loaded.users.map(user => [user.profileId, user.devices]));

  const totals = { claimed: 0, alreadyClaimed: 0, sent: 0, released: 0, failed: 0, devicesDisabled: 0 };
  for (const notice of toSend.slice(0, limit)) {
    const devices = devicesByUser.get(notice.profileId) ?? [];
    const claimed = await claim(notice);
    if (!claimed) {
      totals.alreadyClaimed += 1;
      continue;
    }
    totals.claimed += 1;
    const summary = await deliver(send, devices.map(device => device.token), notice);

    if (summary.invalidTokens.length > 0) {
      const { error } = await supabase
        .from('push_devices')
        .update({ disabled_at: new Date().toISOString() })
        .in('token', summary.invalidTokens)
        .is('disabled_at', null);
      if (error) logger.warn('Could not disable dead tokens', { code: error.code });
      else totals.devicesDisabled += summary.invalidTokens.length;
    }

    const action = rowAction(summary);
    if (action === 'release') {
      // Nothing delivered, but worth retrying next hour.
      const { error } = await supabase.from('notifications_sent').delete().eq('id', claimed);
      if (error) logger.warn('Could not release a claimed notice', { code: error.code });
      totals.released += 1;
    } else {
      const { error } = await supabase
        .from('notifications_sent')
        .update({
          payload: {
            ...payloadOf(notice),
            status: action === 'keep_sent' ? 'sent' : 'failed',
            devices: devices.length,
            delivered: summary.delivered,
            errors: summary.errors.slice(0, 10),
          },
        })
        .eq('id', claimed);
      if (error) logger.warn('Could not record the outcome', { code: error.code });
      if (action === 'keep_sent') totals.sent += 1;
      else totals.failed += 1;
    }
  }
  logger.info('Done', totals);

  async function claim(notice: Notice): Promise<number | null> {
    const { data, error } = await supabase
      .from('notifications_sent')
      .upsert(
        { profile_id: notice.profileId, type: notice.type, dedupe_key: notice.dedupeKey, payload: { ...payloadOf(notice), status: 'pending' } },
        { onConflict: 'profile_id,dedupe_key', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw error;
    const row = (data ?? [])[0] as { id?: number } | undefined;
    return row?.id ?? null;
  }
};

const payloadOf = (notice: Notice) => ({
  title: notice.title,
  body: notice.body,
  route: notice.route,
  channel: notice.channel,
  event_ids: notice.eventIds,
});

run().catch(error => {
  logger.error('sendNotifications failed', { message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});

-- Festivals become a fourth kind of subject (followable, claimable,
-- manageable like artists and venues).
--
-- ALTER TYPE ... ADD VALUE cannot be used by the same transaction that adds
-- it, so this runs on its own before 20261028060200_festivals.sql.

alter type public.subject_type add value if not exists 'festival';
-- Approving a claim logs a moderation action typed by the subject kind.
alter type public.report_target_type add value if not exists 'festival';

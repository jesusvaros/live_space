-- The venue/artist Pro plan is dropped (24 Nov 2026): managing a profile,
-- concerts, QR, clips and stats is free, and so is merch paid inside the app
-- (Live Space keeps its MERCH_FEE_BPS on those orders; paying at the stand
-- stays 0 %). Remove the triggers that required a Pro seller for in-app
-- payment. event_merch.payment_method keeps its 'at_stand' default.
-- subject_plans and subject_is_pro stay (unused, harmless) in case a flat
-- venue/artist fee comes back later.

drop trigger if exists event_merch_in_app_requires_pro on public.event_merch;
drop trigger if exists merch_orders_in_app_requires_pro on public.merch_orders;
drop function if exists public.merch_in_app_requires_pro();

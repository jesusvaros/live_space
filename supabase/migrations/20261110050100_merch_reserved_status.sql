-- Merch reserved to pay at the stand: a new order status.
--
-- ALTER TYPE ... ADD VALUE cannot be used by the same transaction that adds
-- it, so this runs on its own before 20261110050200_merch_pay_at_stand.sql
-- (which only names 'reserved' inside plpgsql bodies, resolved at run time).

alter type public.merch_order_status add value if not exists 'reserved';

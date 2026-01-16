-- Live Space - TEMP: allow role changes for testing
-- Run this to allow changing profiles.role from the app during development.

DROP TRIGGER IF EXISTS profiles_prevent_role_change ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_role_change();

-- To re-enable role lock later, re-run the trigger/function from supabase-venues-migration.sql.

-- ============================================================
-- 019_auth_provisioning.sql
-- Auto-provision a public.users row whenever a new auth.users row is created
-- (e.g. first Google OAuth sign-in). Without this, a real user authenticates
-- but has no users row, so auth_role() returns NULL and every role check fails.
--
-- Domain restriction is NOT enforced here (it is done in the Next.js middleware
-- so the rejection message can be controlled and OAuth signup does not fail with
-- a raw error). role always defaults to 'user'; an admin promotes later via
-- /dashboard/users.
--
-- Run via Supabase SQL Editor (no Supabase MCP in this session), same as 018.
-- After running, re-run the security advisor to check the new SECURITY DEFINER
-- surface.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.email
    ),
    NEW.email,
    'user'
  )
  ON CONFLICT (id) DO NOTHING;  -- tolerate seed rows / create-test-users script
  RETURN NEW;
END;
$$;

-- Recreate the trigger idempotently.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

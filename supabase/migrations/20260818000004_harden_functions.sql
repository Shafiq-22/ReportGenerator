-- =============================================================================
-- Function hardening (Supabase security advisor: 0011, 0028, 0029)
--
-- 1. Pin set_updated_at's search_path so it cannot be influenced by the caller.
-- 2. The role helpers are SECURITY DEFINER and are called *inside* RLS policies,
--    which are evaluated as the `authenticated` role — so authenticated must
--    keep EXECUTE or every query breaks. We revoke EXECUTE from PUBLIC and from
--    the unauthenticated `anon` role so they are no longer callable as
--    `/rest/v1/rpc/*` endpoints without signing in (advisor 0028).
--    Signed-in users can still call them (advisor 0029 stays WARN) — that is
--    unavoidable for RLS helpers, and harmless: each only returns the caller's
--    own permission state. Making SECURITY DEFINER return INVOKER is not an
--    option here (the helpers read `profiles`, which would recurse into its own
--    RLS). Fully clearing 0029 would mean moving them to a non-exposed schema.
-- 3. handle_new_user runs only from the auth.users trigger — never via a policy
--    or the API roles — so it needs no API-role EXECUTE at all.
-- =============================================================================

alter function public.set_updated_at() set search_path = '';

revoke execute on function public.current_app_role()          from public, anon;
grant  execute on function public.current_app_role()          to authenticated;

revoke execute on function public.has_role(public.app_role[]) from public, anon;
grant  execute on function public.has_role(public.app_role[]) to authenticated;

revoke execute on function public.is_staff()                  from public, anon;
grant  execute on function public.is_staff()                  to authenticated;

revoke execute on function public.is_admin()                  from public, anon;
grant  execute on function public.is_admin()                  to authenticated;

revoke execute on function public.is_manager()                from public, anon;
grant  execute on function public.is_manager()                to authenticated;

revoke execute on function public.can_write()                 from public, anon;
grant  execute on function public.can_write()                 to authenticated;

revoke execute on function public.can_edit_report(uuid)       from public, anon;
grant  execute on function public.can_edit_report(uuid)       to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

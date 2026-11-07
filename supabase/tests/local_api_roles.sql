-- Local-only: mimic Supabase's API roles and default grants so PostgREST can
-- serve this database the way Supabase does. Never run on a real project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'local-test-only' noinherit;
  end if;
end $$;
alter role service_role bypassrls;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

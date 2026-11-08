-- Security inventory: what can each role reach? Read-only; safe on any database.
\pset format aligned
\echo '== Tables WITHOUT row level security (should be none)'
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

\echo '== Functions the PUBLIC key (anon) can execute'
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end as runs_as
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and p.prorettype <> 'trigger'::regtype
 order by 1;

\echo '== Functions any signed-in user (authenticated) can execute'
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
   and p.prorettype <> 'trigger'::regtype order by 1;

\echo '== Row level security policies'
select tablename, policyname, cmd, regexp_replace(coalesce(qual, '') , '\s+', ' ', 'g') as using_expr
  from pg_policies where schemaname = 'public' order by tablename, policyname;

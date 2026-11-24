-- Supabase grants the anon and authenticated roles access to every new table in public. Row level
-- security already denies them (no policy exists), but the frontend never talks to the database
-- directly, so the grant has no use and is removed as a second lock. A plain Postgres, like the
-- local one, has no such roles and this does nothing there.
begin;

do $$
declare
    api_role text;
begin
    foreach api_role in array array['anon', 'authenticated'] loop
        if exists (select 1 from pg_roles where rolname = api_role) then
            execute format('revoke all on all tables in schema public from %I', api_role);
            execute format('revoke all on all sequences in schema public from %I', api_role);
            execute format('revoke all on all functions in schema public from %I', api_role);
            execute format('alter default privileges in schema public revoke all on tables from %I', api_role);
            execute format('alter default privileges in schema public revoke all on sequences from %I', api_role);
            execute format('alter default privileges in schema public revoke all on functions from %I', api_role);
        end if;
    end loop;
end
$$;

commit;

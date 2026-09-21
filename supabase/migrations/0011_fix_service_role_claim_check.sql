-- Read the service-role claim from the JWT claims setting used by
-- PostgREST, while retaining the existing authenticated-admin check.

create or replace function prevent_role_self_escalation()
returns trigger
language plpgsql
as $$
declare
  v_jwt_role text;
begin
  v_jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_jwt_role = '' then
    begin
      v_jwt_role := coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'role',
        ''
      );
    exception when others then
      v_jwt_role := '';
    end;
  end if;

  if (
    new.role is distinct from old.role
    or new.hr_code is distinct from old.hr_code
  )
  and not is_admin()
  and v_jwt_role <> 'service_role' then
    raise exception 'not authorized to change role or HR code';
  end if;
  return new;
end;
$$;

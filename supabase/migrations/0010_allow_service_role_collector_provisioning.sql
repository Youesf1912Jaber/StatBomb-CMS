-- Allow the server-side service-role collector provisioning workflow to set
-- operational HR codes while preserving authenticated self-escalation checks.

create or replace function prevent_role_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if (
    new.role is distinct from old.role
    or new.hr_code is distinct from old.hr_code
  )
  and not is_admin()
  and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'not authorized to change role or HR code';
  end if;
  return new;
end;
$$;

-- Admin-only update of distribution operational details after assignment
-- creation: assignment shift_date and match official_website_url.
-- Does not change assignment status, timestamps, SLA, identity, or timers.

create or replace function update_distribution_details(
  p_assignment_id uuid,
  p_shift_date date,
  p_official_website_url text
) returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_old_assignment assignments%rowtype;
  v_old_url text;
  v_new_url text;
  v_old_value jsonb := '{}'::jsonb;
  v_new_value jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_old_assignment
  from assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'not found';
  end if;

  select official_website_url into v_old_url
  from matches
  where id = v_old_assignment.match_id
  for update;

  if not found then
    raise exception 'not found';
  end if;

  if p_official_website_url is null or btrim(p_official_website_url) = '' then
    v_new_url := null;
  else
    v_new_url := btrim(p_official_website_url);
    if v_new_url !~* '^https?://' then
      raise exception 'invalid official website url';
    end if;
  end if;

  if p_shift_date is distinct from v_old_assignment.shift_date then
    v_old_value := v_old_value || jsonb_build_object('shift_date', v_old_assignment.shift_date);
    v_new_value := v_new_value || jsonb_build_object('shift_date', p_shift_date);
  end if;

  if v_new_url is distinct from v_old_url then
    v_old_value := v_old_value || jsonb_build_object('official_website_url', v_old_url);
    v_new_value := v_new_value || jsonb_build_object('official_website_url', v_new_url);
  end if;

  if v_old_value = '{}'::jsonb then
    return v_old_assignment;
  end if;

  if p_shift_date is distinct from v_old_assignment.shift_date then
    update assignments
    set shift_date = p_shift_date,
        updated_at = now()
    where id = p_assignment_id
    returning * into v_assignment;
  else
    v_assignment := v_old_assignment;
  end if;

  if v_new_url is distinct from v_old_url then
    update matches
    set official_website_url = v_new_url,
        updated_at = now()
    where id = v_old_assignment.match_id;
  end if;

  insert into activity_logs (user_id, assignment_id, action, old_value, new_value)
  values (
    auth.uid(),
    p_assignment_id,
    'assignment_updated',
    v_old_value,
    v_new_value
  );

  return v_assignment;
end;
$$;

revoke all on function update_distribution_details(uuid, date, text) from public;
grant execute on function update_distribution_details(uuid, date, text) to authenticated;

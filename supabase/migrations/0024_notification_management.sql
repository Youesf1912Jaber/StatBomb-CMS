-- Recipients (admins and collectors) may mark their own notifications as
-- read and delete their own notification records. Migration 0016 narrowed
-- UPDATE to is_active_collector(), which blocked admins from marking
-- notifications read. Restore recipient-only ownership without weakening RLS.

drop policy if exists notifications_owner_update on notifications;
create policy notifications_owner_update on notifications
  for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists notifications_owner_delete on notifications;
create policy notifications_owner_delete on notifications
  for delete
  using (recipient_id = auth.uid());

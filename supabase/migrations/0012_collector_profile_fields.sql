-- Phase 5: persist operational Team roster fields on profiles.

alter table profiles
  add column if not exists phone text,
  add column if not exists team text,
  add column if not exists status text;

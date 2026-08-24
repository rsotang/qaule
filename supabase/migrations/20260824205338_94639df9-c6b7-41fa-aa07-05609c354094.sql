create table if not exists public.python_scripts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

grant select, insert, update, delete on public.python_scripts to authenticated;
grant all on public.python_scripts to service_role;

alter table public.python_scripts enable row level security;

drop policy if exists "python_scripts shared read" on public.python_scripts;
create policy "python_scripts shared read" on public.python_scripts
  for select to authenticated using (true);

drop policy if exists "python_scripts shared insert" on public.python_scripts;
create policy "python_scripts shared insert" on public.python_scripts
  for insert to authenticated with check (true);

drop policy if exists "python_scripts shared update" on public.python_scripts;
create policy "python_scripts shared update" on public.python_scripts
  for update to authenticated using (true) with check (true);

drop policy if exists "python_scripts shared delete" on public.python_scripts;
create policy "python_scripts shared delete" on public.python_scripts
  for delete to authenticated using (true);
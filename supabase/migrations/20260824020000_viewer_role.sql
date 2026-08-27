-- Rol de solo lectura para demos (ve todo, no puede escribir)
alter type public.app_role add value if not exists 'viewer';

-- upsert_calendar_task es SECURITY DEFINER (ignora RLS): exigir rol escribible.
create or replace function public.upsert_calendar_task(
  p_id text,
  p_ym text,
  p_test_name text,
  p_measured boolean,
  p_analyzed boolean,
  p_note text,
  p_user_id uuid,
  p_user_name text,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_measured boolean;
  v_analyzed boolean;
  v_done boolean;
  v_measured_by uuid;
  v_measured_by_name text;
  v_measured_at timestamptz;
  v_analyzed_by uuid;
  v_analyzed_by_name text;
  v_analyzed_at timestamptz;
  v_completed_by uuid;
  v_completed_by_name text;
  v_completed_at timestamptz;
  v_note text;
  v_existing record;
begin
  -- Solo admin/user pueden escribir; viewer (demo) queda en solo lectura.
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'user')) then
    raise exception 'Modo solo lectura: no puedes modificar el calendario';
  end if;

  select * into v_existing from public.calendar_tasks where id = p_id;

  -- Measured
  if p_measured is not null then
    v_measured := p_measured;
    if p_measured then
      v_measured_by := p_user_id;
      v_measured_by_name := p_user_name;
      v_measured_at := coalesce(v_existing.measured_at, p_now);
    else
      v_measured_by := null;
      v_measured_by_name := null;
      v_measured_at := null;
    end if;
  elsif v_existing.id is not null then
    v_measured := v_existing.measured;
    v_measured_by := v_existing.measured_by;
    v_measured_by_name := v_existing.measured_by_name;
    v_measured_at := v_existing.measured_at;
  else
    v_measured := false;
  end if;

  -- Analyzed
  if p_analyzed is not null then
    v_analyzed := p_analyzed;
    if p_analyzed then
      v_analyzed_by := p_user_id;
      v_analyzed_by_name := p_user_name;
      v_analyzed_at := coalesce(v_existing.analyzed_at, p_now);
    else
      v_analyzed_by := null;
      v_analyzed_by_name := null;
      v_analyzed_at := null;
    end if;
  elsif v_existing.id is not null then
    v_analyzed := v_existing.analyzed;
    v_analyzed_by := v_existing.analyzed_by;
    v_analyzed_by_name := v_existing.analyzed_by_name;
    v_analyzed_at := v_existing.analyzed_at;
  else
    v_analyzed := false;
  end if;

  v_done := v_measured and v_analyzed;

  -- Completed
  if v_done then
    v_completed_by := p_user_id;
    v_completed_by_name := p_user_name;
    v_completed_at := coalesce(v_existing.completed_at, p_now);
  else
    v_completed_by := null;
    v_completed_by_name := null;
    v_completed_at := null;
  end if;

  -- Note
  v_note := coalesce(p_note, v_existing.note);

  insert into public.calendar_tasks (
    id, ym, test_name, done,
    measured, measured_by, measured_by_name, measured_at,
    analyzed, analyzed_by, analyzed_by_name, analyzed_at,
    completed_by, completed_by_name, completed_at,
    note, updated_at
  ) values (
    p_id, p_ym, p_test_name, v_done,
    v_measured, v_measured_by, v_measured_by_name, v_measured_at,
    v_analyzed, v_analyzed_by, v_analyzed_by_name, v_analyzed_at,
    v_completed_by, v_completed_by_name, v_completed_at,
    v_note, p_now
  )
  on conflict (id) do update set
    ym = excluded.ym,
    test_name = excluded.test_name,
    done = excluded.done,
    measured = excluded.measured,
    measured_by = excluded.measured_by,
    measured_by_name = excluded.measured_by_name,
    measured_at = excluded.measured_at,
    analyzed = excluded.analyzed,
    analyzed_by = excluded.analyzed_by,
    analyzed_by_name = excluded.analyzed_by_name,
    analyzed_at = excluded.analyzed_at,
    completed_by = excluded.completed_by,
    completed_by_name = excluded.completed_by_name,
    completed_at = excluded.completed_at,
    note = excluded.note,
    updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.upsert_calendar_task(text, text, text, boolean, boolean, text, uuid, text, timestamptz) to authenticated;

-- python_scripts: escritura solo para admin/user (el viewer no guarda scripts).
drop policy if exists "python_scripts shared insert" on public.python_scripts;
create policy "python_scripts shared insert" on public.python_scripts
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'user'));

drop policy if exists "python_scripts shared update" on public.python_scripts;
create policy "python_scripts shared update" on public.python_scripts
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'user'));

drop policy if exists "python_scripts shared delete" on public.python_scripts;
create policy "python_scripts shared delete" on public.python_scripts
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'user'));

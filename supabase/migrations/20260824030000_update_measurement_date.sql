-- Permite a cualquier usuario con rol (incluido el viewer/demo) corregir la
-- fecha de una medición desde Visualización. El resto de campos de measurements
-- siguen protegidos por RLS (solo admin/user).
create or replace function public.update_measurement_date(p_id uuid, p_date text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.user_roles where user_id = auth.uid()) then
    raise exception 'Usuario sin rol asignado';
  end if;

  update public.measurements
     set date = p_date
   where id = p_id;
end;
$$;

grant execute on function public.update_measurement_date(uuid, text) to authenticated;

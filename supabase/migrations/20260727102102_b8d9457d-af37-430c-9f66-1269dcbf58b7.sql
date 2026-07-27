-- 1) Replace permissive ALL policies with read-for-authenticated + write-for-role-holders

-- machines
DROP POLICY IF EXISTS "Authenticated full access machines" ON public.machines;
CREATE POLICY "Authenticated read machines" ON public.machines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Role holders insert machines" ON public.machines
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders update machines" ON public.machines
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders delete machines" ON public.machines
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

-- templates
DROP POLICY IF EXISTS "Authenticated full access templates" ON public.templates;
CREATE POLICY "Authenticated read templates" ON public.templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Role holders insert templates" ON public.templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders update templates" ON public.templates
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders delete templates" ON public.templates
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

-- imports
DROP POLICY IF EXISTS "Authenticated full access imports" ON public.imports;
CREATE POLICY "Authenticated read imports" ON public.imports
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Role holders insert imports" ON public.imports
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders update imports" ON public.imports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders delete imports" ON public.imports
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

-- measurements
DROP POLICY IF EXISTS "Authenticated full access measurements" ON public.measurements;
CREATE POLICY "Authenticated read measurements" ON public.measurements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Role holders insert measurements" ON public.measurements
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders update measurements" ON public.measurements
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders delete measurements" ON public.measurements
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

-- calendar
DROP POLICY IF EXISTS "Authenticated full access calendar" ON public.calendar;
CREATE POLICY "Authenticated read calendar" ON public.calendar
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Role holders insert calendar" ON public.calendar
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders update calendar" ON public.calendar
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));
CREATE POLICY "Role holders delete calendar" ON public.calendar
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

-- 2) Revoke anonymous EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.public_has_any_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.public_has_any_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
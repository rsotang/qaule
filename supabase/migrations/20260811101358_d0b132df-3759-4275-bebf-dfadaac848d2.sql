DROP POLICY IF EXISTS "Role holders insert templates" ON public.templates;
DROP POLICY IF EXISTS "Role holders update templates" ON public.templates;
DROP POLICY IF EXISTS "Role holders delete templates" ON public.templates;

CREATE POLICY "Admins insert templates" ON public.templates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update templates" ON public.templates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete templates" ON public.templates FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Role holders update machines" ON public.machines;
CREATE POLICY "Admins update machines" ON public.machines FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
-- Tipos de máquina configurables y catálogo de categorías de prueba.
-- Los tipos definen qué categorías de prueba pueden usar sus máquinas.

CREATE TABLE IF NOT EXISTS public.machine_kinds (
  id text PRIMARY KEY,
  name text NOT NULL,
  builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.machine_kind_categories (
  kind_id text NOT NULL REFERENCES public.machine_kinds(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (kind_id, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_kinds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_kind_categories TO authenticated;
GRANT ALL ON public.machine_kinds TO service_role;
GRANT ALL ON public.categories TO service_role;
GRANT ALL ON public.machine_kind_categories TO service_role;

ALTER TABLE public.machine_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_kind_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read machine_kinds" ON public.machine_kinds
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert machine_kinds" ON public.machine_kinds
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update machine_kinds" ON public.machine_kinds
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete machine_kinds" ON public.machine_kinds
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert categories" ON public.categories
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update categories" ON public.categories
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete categories" ON public.categories
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read machine_kind_categories" ON public.machine_kind_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert machine_kind_categories" ON public.machine_kind_categories
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update machine_kind_categories" ON public.machine_kind_categories
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete machine_kind_categories" ON public.machine_kind_categories
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed de tipos y categorías de fábrica
INSERT INTO public.machine_kinds (id, name, builtin) VALUES
  ('linac', 'Acelerador lineal', true),
  ('imaging', 'Sistema de imagen', true),
  ('ct', 'TC / Simulador', true),
  ('other', 'Otro', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categories (id, name, builtin) VALUES
  ('mechanical_unit', 'Mecánico Unidad', true),
  ('mechanical_table', 'Mecánico Mesa', true),
  ('geometric', 'Geométrico Haz', true),
  ('mlc', 'MLC', true),
  ('dosimetric_photon', 'Dosimétrico Fotones', true),
  ('dosimetric_electron', 'Dosimétrico Electrones', true),
  ('monitor_system', 'Sistema Monitor', true),
  ('image_geometry', 'Geometría', true),
  ('image_registration', 'Sistema de Registro', true),
  ('image_quality_mv', 'Calidad Imagen MV', true),
  ('image_quality_cbct', 'Calidad Imagen CBCT', true),
  ('image_sgrt', 'QC SGRT', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.machine_kind_categories (kind_id, category_id)
SELECT k.id, c.id
FROM (VALUES
  ('linac', 'mechanical_unit'),
  ('linac', 'mechanical_table'),
  ('linac', 'geometric'),
  ('linac', 'mlc'),
  ('linac', 'dosimetric_photon'),
  ('linac', 'dosimetric_electron'),
  ('linac', 'monitor_system'),
  ('imaging', 'image_geometry'),
  ('imaging', 'image_registration'),
  ('imaging', 'image_quality_mv'),
  ('imaging', 'image_quality_cbct'),
  ('imaging', 'image_sgrt'),
  ('ct', 'mechanical_unit'),
  ('ct', 'mechanical_table'),
  ('ct', 'geometric'),
  ('ct', 'mlc'),
  ('ct', 'dosimetric_photon'),
  ('ct', 'dosimetric_electron'),
  ('ct', 'monitor_system'),
  ('other', 'mechanical_unit'),
  ('other', 'mechanical_table'),
  ('other', 'geometric'),
  ('other', 'mlc'),
  ('other', 'dosimetric_photon'),
  ('other', 'dosimetric_electron'),
  ('other', 'monitor_system')
) AS seed(kind_id, category_id)
JOIN public.machine_kinds k ON k.id = seed.kind_id
JOIN public.categories c ON c.id = seed.category_id
ON CONFLICT (kind_id, category_id) DO NOTHING;

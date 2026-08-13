-- Categoría MPC (Varian) en el catálogo global, asociada a los tipos que la usan.
INSERT INTO public.categories (id, name, builtin) VALUES
  ('mpc', 'MPC (Varian)', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.machine_kind_categories (kind_id, category_id)
SELECT k.id, 'mpc'
FROM public.machine_kinds k
WHERE k.id IN ('linac', 'other')
ON CONFLICT (kind_id, category_id) DO NOTHING;

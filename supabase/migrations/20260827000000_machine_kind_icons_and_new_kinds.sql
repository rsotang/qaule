-- Icono por tipo de máquina + nuevos tipos de fábrica (uno por cada icono del panel QA).
-- El icono identifica el archivo en /iconos/ (public) y se muestra en el resumen QA.

ALTER TABLE public.machine_kinds ADD COLUMN IF NOT EXISTS icon text;

-- Iconos de los tipos existentes (el "Sistema de imagen" y "Otro" usan el de TC)
UPDATE public.machine_kinds SET icon = 'linac' WHERE id = 'linac' AND icon IS NULL;
UPDATE public.machine_kinds SET icon = 'ct'    WHERE id IN ('imaging', 'ct', 'other') AND icon IS NULL;

-- Nuevos tipos de fábrica (uno por cada icono)
INSERT INTO public.machine_kinds (id, name, builtin, icon) VALUES
  ('arco-quirurgico', 'Arco quirúrgico', true, 'arco-quirurgico'),
  ('cbct-dental',     'CBCT dental',    true, 'cbct-dental'),
  ('cbctlinac',       'CBCT en linac',  true, 'cbctlinac'),
  ('dental',          'Dental (RX)',    true, 'dental'),
  ('generalrx',       'RX general',     true, 'generalrx'),
  ('hdr',             'HDR (Braquiterapia)', true, 'hdr'),
  ('mamo',            'Mamografía',     true, 'mamo'),
  ('mr',              'Resonancia magnética', true, 'mr'),
  ('pet',             'PET',            true, 'pet'),
  ('portatilrx',      'RX portátil',    true, 'portatilrx'),
  ('spect',           'SPECT',          true, 'spect'),
  ('us',              'Ecografía',      true, 'us')
ON CONFLICT (id) DO NOTHING;

-- Categorías de los nuevos tipos (imagen: mismo set que "Sistema de imagen";
-- HDR: mecánicas + dosimétricas sin MLC)
INSERT INTO public.machine_kind_categories (kind_id, category_id)
SELECT k.id, c.id
FROM (VALUES
  ('arco-quirurgico', 'image_geometry'),
  ('arco-quirurgico', 'image_registration'),
  ('arco-quirurgico', 'image_quality_mv'),
  ('arco-quirurgico', 'image_quality_cbct'),
  ('arco-quirurgico', 'image_sgrt'),
  ('cbct-dental', 'image_geometry'),
  ('cbct-dental', 'image_registration'),
  ('cbct-dental', 'image_quality_mv'),
  ('cbct-dental', 'image_quality_cbct'),
  ('cbct-dental', 'image_sgrt'),
  ('cbctlinac', 'image_geometry'),
  ('cbctlinac', 'image_registration'),
  ('cbctlinac', 'image_quality_mv'),
  ('cbctlinac', 'image_quality_cbct'),
  ('cbctlinac', 'image_sgrt'),
  ('cbctlinac', 'mpc'),
  ('dental', 'image_geometry'),
  ('dental', 'image_registration'),
  ('dental', 'image_quality_mv'),
  ('dental', 'image_quality_cbct'),
  ('dental', 'image_sgrt'),
  ('generalrx', 'image_geometry'),
  ('generalrx', 'image_registration'),
  ('generalrx', 'image_quality_mv'),
  ('generalrx', 'image_quality_cbct'),
  ('generalrx', 'image_sgrt'),
  ('hdr', 'mechanical_unit'),
  ('hdr', 'mechanical_table'),
  ('hdr', 'geometric'),
  ('hdr', 'dosimetric_photon'),
  ('hdr', 'dosimetric_electron'),
  ('hdr', 'monitor_system'),
  ('mamo', 'image_geometry'),
  ('mamo', 'image_registration'),
  ('mamo', 'image_quality_mv'),
  ('mamo', 'image_quality_cbct'),
  ('mamo', 'image_sgrt'),
  ('mr', 'image_geometry'),
  ('mr', 'image_registration'),
  ('mr', 'image_quality_mv'),
  ('mr', 'image_quality_cbct'),
  ('mr', 'image_sgrt'),
  ('pet', 'image_geometry'),
  ('pet', 'image_registration'),
  ('pet', 'image_quality_mv'),
  ('pet', 'image_quality_cbct'),
  ('pet', 'image_sgrt'),
  ('portatilrx', 'image_geometry'),
  ('portatilrx', 'image_registration'),
  ('portatilrx', 'image_quality_mv'),
  ('portatilrx', 'image_quality_cbct'),
  ('portatilrx', 'image_sgrt'),
  ('spect', 'image_geometry'),
  ('spect', 'image_registration'),
  ('spect', 'image_quality_mv'),
  ('spect', 'image_quality_cbct'),
  ('spect', 'image_sgrt'),
  ('us', 'image_geometry'),
  ('us', 'image_registration'),
  ('us', 'image_quality_mv'),
  ('us', 'image_quality_cbct'),
  ('us', 'image_sgrt')
) AS seed(kind_id, category_id)
JOIN public.machine_kinds k ON k.id = seed.kind_id
JOIN public.categories c ON c.id = seed.category_id
ON CONFLICT (kind_id, category_id) DO NOTHING;

-- Máquinas nuevas (una por cada icono nuevo)
INSERT INTO public.machines (id, name, kind) VALUES
  ('ARCO1',   'Arco Quirúrgico 1', 'arco-quirurgico'),
  ('CBCTD1',  'CBCT Dental 1',     'cbct-dental'),
  ('CBCTL1',  'CBCT Linac 1',      'cbctlinac'),
  ('DENTAL1', 'Dental 1',          'dental'),
  ('RXG1',    'RX General 1',      'generalrx'),
  ('HDR1',    'HDR 1',             'hdr'),
  ('MAMO1',   'Mamografía 1',      'mamo'),
  ('MR1',     'RM 1',              'mr'),
  ('PET1',    'PET 1',             'pet'),
  ('RXP1',    'RX Portátil 1',     'portatilrx'),
  ('SPECT1',  'SPECT 1',           'spect'),
  ('US1',     'Ecógrafo 1',        'us')
ON CONFLICT (id) DO NOTHING;

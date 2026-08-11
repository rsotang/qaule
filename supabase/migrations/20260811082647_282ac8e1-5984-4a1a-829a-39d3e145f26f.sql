ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'linac';

UPDATE public.machines SET kind = 'imaging' WHERE id LIKE 'IMG%';
UPDATE public.machines SET kind = 'ct' WHERE id = 'CTSIM';
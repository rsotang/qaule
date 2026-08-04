ALTER TABLE public.calendar_tasks
  ADD COLUMN IF NOT EXISTS measured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS measured_by uuid,
  ADD COLUMN IF NOT EXISTS measured_by_name text,
  ADD COLUMN IF NOT EXISTS measured_at timestamptz,
  ADD COLUMN IF NOT EXISTS analyzed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS analyzed_by uuid,
  ADD COLUMN IF NOT EXISTS analyzed_by_name text,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- Backfill existing rows: tasks previously marked done are considered both measured and analyzed
UPDATE public.calendar_tasks
SET measured = true,
    analyzed = true,
    measured_by = completed_by,
    measured_by_name = completed_by_name,
    measured_at = completed_at,
    analyzed_by = completed_by,
    analyzed_by_name = completed_by_name,
    analyzed_at = completed_at
WHERE done = true;

-- Ensure updated_at trigger exists (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_calendar_tasks_updated_at ON public.calendar_tasks;
CREATE TRIGGER update_calendar_tasks_updated_at
  BEFORE UPDATE ON public.calendar_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
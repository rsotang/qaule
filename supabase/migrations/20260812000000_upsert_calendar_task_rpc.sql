CREATE OR REPLACE FUNCTION public.upsert_calendar_task(
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
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
BEGIN
  SELECT * INTO v_existing FROM public.calendar_tasks WHERE id = p_id;

  -- Measured
  IF p_measured IS NOT NULL THEN
    v_measured := p_measured;
    IF p_measured THEN
      v_measured_by := p_user_id;
      v_measured_by_name := p_user_name;
      v_measured_at := COALESCE(v_existing.measured_at, p_now);
    ELSE
      v_measured_by := NULL;
      v_measured_by_name := NULL;
      v_measured_at := NULL;
    END IF;
  ELSIF v_existing.id IS NOT NULL THEN
    v_measured := v_existing.measured;
    v_measured_by := v_existing.measured_by;
    v_measured_by_name := v_existing.measured_by_name;
    v_measured_at := v_existing.measured_at;
  ELSE
    v_measured := false;
  END IF;

  -- Analyzed
  IF p_analyzed IS NOT NULL THEN
    v_analyzed := p_analyzed;
    IF p_analyzed THEN
      v_analyzed_by := p_user_id;
      v_analyzed_by_name := p_user_name;
      v_analyzed_at := COALESCE(v_existing.analyzed_at, p_now);
    ELSE
      v_analyzed_by := NULL;
      v_analyzed_by_name := NULL;
      v_analyzed_at := NULL;
    END IF;
  ELSIF v_existing.id IS NOT NULL THEN
    v_analyzed := v_existing.analyzed;
    v_analyzed_by := v_existing.analyzed_by;
    v_analyzed_by_name := v_existing.analyzed_by_name;
    v_analyzed_at := v_existing.analyzed_at;
  ELSE
    v_analyzed := false;
  END IF;

  v_done := v_measured AND v_analyzed;

  -- Completed
  IF v_done THEN
    v_completed_by := p_user_id;
    v_completed_by_name := p_user_name;
    v_completed_at := COALESCE(v_existing.completed_at, p_now);
  ELSE
    v_completed_by := NULL;
    v_completed_by_name := NULL;
    v_completed_at := NULL;
  END IF;

  -- Note
  v_note := COALESCE(p_note, v_existing.note);

  INSERT INTO public.calendar_tasks (
    id, ym, test_name, done,
    measured, measured_by, measured_by_name, measured_at,
    analyzed, analyzed_by, analyzed_by_name, analyzed_at,
    completed_by, completed_by_name, completed_at,
    note, updated_at
  ) VALUES (
    p_id, p_ym, p_test_name, v_done,
    v_measured, v_measured_by, v_measured_by_name, v_measured_at,
    v_analyzed, v_analyzed_by, v_analyzed_by_name, v_analyzed_at,
    v_completed_by, v_completed_by_name, v_completed_at,
    v_note, p_now
  )
  ON CONFLICT (id) DO UPDATE SET
    ym = EXCLUDED.ym,
    test_name = EXCLUDED.test_name,
    done = EXCLUDED.done,
    measured = EXCLUDED.measured,
    measured_by = EXCLUDED.measured_by,
    measured_by_name = EXCLUDED.measured_by_name,
    measured_at = EXCLUDED.measured_at,
    analyzed = EXCLUDED.analyzed,
    analyzed_by = EXCLUDED.analyzed_by,
    analyzed_by_name = EXCLUDED.analyzed_by_name,
    analyzed_at = EXCLUDED.analyzed_at,
    completed_by = EXCLUDED.completed_by,
    completed_by_name = EXCLUDED.completed_by_name,
    completed_at = EXCLUDED.completed_at,
    note = EXCLUDED.note,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Grant execute to authenticated users (RLS will still protect row access)
GRANT EXECUTE ON FUNCTION public.upsert_calendar_task(text, text, text, boolean, boolean, text, uuid, text, timestamptz) TO authenticated;

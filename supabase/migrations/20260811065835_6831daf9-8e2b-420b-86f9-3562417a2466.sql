CREATE INDEX IF NOT EXISTS idx_measurements_machine_date ON public.measurements (machine_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_import_id ON public.measurements (import_id);
CREATE INDEX IF NOT EXISTS idx_measurements_test_id ON public.measurements (test_id);
CREATE INDEX IF NOT EXISTS idx_measurements_cell_label ON public.measurements (cell_label);
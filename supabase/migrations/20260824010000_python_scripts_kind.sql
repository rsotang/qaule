-- Scripts Python: distinguir análisis LinaQA de scripts sueltos
alter table public.python_scripts
  add column if not exists kind text not null default 'script';

create index if not exists python_scripts_kind_idx on public.python_scripts (kind);

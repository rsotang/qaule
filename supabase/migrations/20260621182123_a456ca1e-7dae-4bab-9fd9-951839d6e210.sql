
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Admins can read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- On new user: create profile + assign role (first user = admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count int;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Public RPC: is there any user yet? Used for first-run admin bootstrap UI.
CREATE OR REPLACE FUNCTION public.public_has_any_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users)
$$;
GRANT EXECUTE ON FUNCTION public.public_has_any_user() TO anon, authenticated;

-- App tables (fully shared among authenticated users)
CREATE TABLE public.machines (
  id text PRIMARY KEY,
  name text NOT NULL,
  active_template_id text,
  state text,
  state_note text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machines TO authenticated;
GRANT ALL ON public.machines TO service_role;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access machines" ON public.machines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.templates (
  id text PRIMARY KEY,
  machine_id text NOT NULL,
  name text NOT NULL,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  default_date_cell jsonb,
  tests jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access templates" ON public.templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX templates_machine_idx ON public.templates (machine_id);

CREATE TABLE public.imports (
  id text PRIMARY KEY,
  machine_id text NOT NULL,
  file_name text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  source_date date NOT NULL,
  file_hash text NOT NULL,
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO authenticated;
GRANT ALL ON public.imports TO service_role;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access imports" ON public.imports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX imports_machine_idx ON public.imports (machine_id);

CREATE TABLE public.measurements (
  id text PRIMARY KEY,
  import_id text NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  machine_id text NOT NULL,
  test_id text NOT NULL,
  cell_label text NOT NULL,
  date date NOT NULL,
  value double precision NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurements TO authenticated;
GRANT ALL ON public.measurements TO service_role;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access measurements" ON public.measurements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX measurements_machine_idx ON public.measurements (machine_id);
CREATE INDEX measurements_import_idx ON public.measurements (import_id);
CREATE INDEX measurements_test_idx ON public.measurements (test_id);

CREATE TABLE public.calendar (
  id text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  file_name text,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar TO authenticated;
GRANT ALL ON public.calendar TO service_role;
ALTER TABLE public.calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access calendar" ON public.calendar FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed machines
INSERT INTO public.machines (id, name) VALUES
  ('TB1', 'TrueBeam 1'),
  ('TB2', 'TrueBeam 2'),
  ('TB3', 'TrueBeam 3'),
  ('IMG1', 'Sistema de Imagen TB1'),
  ('IMG2', 'Sistema de Imagen TB2'),
  ('IMG3', 'Sistema de Imagen TB3'),
  ('CTSIM', 'CT Simulador')
ON CONFLICT (id) DO NOTHING;

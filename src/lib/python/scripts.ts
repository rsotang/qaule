import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ScriptKind = "script" | "analysis";

export interface PythonScript {
  id: string;
  name: string;
  code: string;
  kind: ScriptKind;
  updated_at: string;
  updated_by: string | null;
}

type ScriptRow = {
  id: string;
  name: string;
  code: string;
  kind: ScriptKind;
  updated_at: string;
  updated_by: string | null;
};

// La tabla python_scripts se crea con la migración 20260824000000_python_scripts.sql
// y la columna kind con 20260824010000_python_scripts_kind.sql. Aún no existen
// en los tipos generados de Supabase; extendemos el tipo sin tocar lo generado.
type ExtendedDatabase = Database & {
  public: {
    Tables: {
      python_scripts: {
        Row: ScriptRow;
        Insert: {
          id?: string;
          name: string;
          code: string;
          kind?: ScriptKind;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<ScriptRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

const client = createClient<ExtendedDatabase>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

const TABLE = "python_scripts";

function rowToScript(r: ScriptRow): PythonScript {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    kind: r.kind === "analysis" ? "analysis" : "script",
    updated_at: r.updated_at,
    updated_by: r.updated_by,
  };
}

export async function listScripts(kind?: ScriptKind): Promise<PythonScript[]> {
  let q = client
    .from(TABLE)
    .select("id, name, code, kind, updated_at, updated_by")
    .order("updated_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToScript);
}

export async function saveScript(rec: {
  id?: string;
  name: string;
  code: string;
  kind?: ScriptKind;
}): Promise<PythonScript> {
  const { data: user, error: userError } = await client.auth.getUser();
  if (userError || !user.user) throw new Error("Sesión no válida");
  const id = rec.id ?? crypto.randomUUID();
  const { data, error } = await client
    .from(TABLE)
    .upsert(
      {
        id,
        name: rec.name,
        code: rec.code,
        kind: rec.kind ?? "script",
        updated_at: new Date().toISOString(),
        updated_by: user.user.id,
      },
      { onConflict: "id" },
    )
    .select("id, name, code, kind, updated_at, updated_by")
    .single();
  if (error) throw new Error(error.message);
  return rowToScript(data);
}

export async function deleteScript(id: string): Promise<void> {
  const { error } = await client.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

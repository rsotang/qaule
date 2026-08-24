import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface PythonScript {
  id: string;
  name: string;
  code: string;
  updated_at: string;
  updated_by: string | null;
}

type ScriptRow = {
  id: string;
  name: string;
  code: string;
  updated_at: string;
  updated_by: string | null;
};

// La tabla python_scripts la crea la migración 20260824000000_python_scripts.sql
// y aún no existe en los tipos generados de Supabase. Extendemos el tipo sin
// tocar los ficheros generados.
type ExtendedDatabase = Database & {
  public: {
    Tables: {
      python_scripts: {
        Row: ScriptRow;
        Insert: {
          id?: string;
          name: string;
          code: string;
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
    updated_at: r.updated_at,
    updated_by: r.updated_by,
  };
}

export async function listScripts(): Promise<PythonScript[]> {
  const { data, error } = await client
    .from(TABLE)
    .select("id, name, code, updated_at, updated_by")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToScript);
}

export async function saveScript(rec: {
  id?: string;
  name: string;
  code: string;
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
        updated_at: new Date().toISOString(),
        updated_by: user.user.id,
      },
      { onConflict: "id" },
    )
    .select("id, name, code, updated_at, updated_by")
    .single();
  if (error) throw new Error(error.message);
  return rowToScript(data);
}

export async function deleteScript(id: string): Promise<void> {
  const { error } = await client.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

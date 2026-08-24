import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase
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
  const { data: user, error: userError } = await supabase.auth.getUser();
  if (userError || !user.user) throw new Error("Sesión no válida");
  const id = rec.id ?? crypto.randomUUID();
  const { data, error } = await supabase
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
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

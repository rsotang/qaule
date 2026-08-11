import { createFileRoute, Link } from "@tanstack/react-router";
import { useMachineList } from "@/hooks/use-machine-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listMachines, listTemplates, saveTemplate, setActiveTemplate, deleteTemplate, clearActiveTemplate, getTemplate } from "@/lib/qa/db";
import { MACHINES, type MachineId, type Template } from "@/lib/qa/types";
import { buildSeedTemplate } from "@/lib/qa/seed";
import { toast } from "sonner";
import { Plus, Pencil, CheckCircle2, Trash2, Download, Upload, Eye } from "lucide-react";
import { useIsAdmin } from "@/hooks/use-is-admin";


export const Route = createFileRoute("/_authenticated/templates/")({ component: TemplatesIndex });

function TemplatesIndex() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();

  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });
  const machineList = useMachineList();
  const templates = useQuery({ queryKey: ["templates-all"], queryFn: () => listTemplates() });
  const importInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function seedOne(machineId: MachineId) {
    const t = buildSeedTemplate(machineId);
    t.id = `tpl-${machineId}-${Date.now()}`;
    await saveTemplate(t);
    await setActiveTemplate(machineId, t.id);
    toast.success(`Plantilla inicial creada para ${machineId}`);
    qc.invalidateQueries();
  }

  async function activate(machineId: string, templateId: string) {
    await setActiveTemplate(machineId, templateId);
    toast.success("Plantilla activada");
    qc.invalidateQueries();
  }

  async function handleDelete(machineId: string, templateId: string, isActive: boolean) {
    if (!window.confirm("¿Eliminar esta plantilla? Los datos ya importados no se borran.")) return;
    await deleteTemplate(templateId);
    if (isActive) await clearActiveTemplate(machineId);
    toast.success("Plantilla eliminada");
    qc.invalidateQueries();
  }

  async function handleExport(templateId: string) {
    const t = await getTemplate(templateId);
    if (!t) return;
    const blob = new Blob([JSON.stringify(t, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.machineId}-${t.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Plantilla exportada");
  }

  async function handleImport(machineId: MachineId, file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Template;
      if (!parsed || !Array.isArray(parsed.tests)) throw new Error("Formato inválido");
      const imported: Template = {
        ...parsed,
        id: `tpl-${machineId}-${Date.now()}`,
        machineId,
        createdAt: new Date().toISOString(),
        name: parsed.name ? `${parsed.name} (importada)` : "Plantilla importada",
      };
      await saveTemplate(imported);
      toast.success(`Plantilla importada para ${machineId}`);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(`No se pudo importar: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Plantillas</h1>
        <p className="text-sm text-muted-foreground">
          Define qué tests extraer y en qué celdas se encuentran. Cada máquina tiene su plantilla activa.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {machineList.map((m) => {
          const machine = machines.data?.find((x) => x.id === m.id);
          const machineTemplates = templates.data?.filter((t) => t.machineId === m.id) ?? [];
          return (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {m.id} <span className="font-normal text-muted-foreground">— {m.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {machineTemplates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin plantillas.</p>
                ) : (
                  <ul className="space-y-1">
                    {machineTemplates.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between rounded-md border bg-card px-2 py-1.5 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {machine?.activeTemplateId === t.id && (
                            <CheckCircle2 className="size-4 text-green-600" />
                          )}
                          <span>
                            {t.name}{" "}
                            <span className="text-xs text-muted-foreground">
                              ({t.tests.length} tests)
                            </span>
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {isAdmin && machine?.activeTemplateId !== t.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => activate(m.id, t.id)}
                            >
                              Activar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Exportar"
                            onClick={() => handleExport(t.id)}
                          >
                            <Download className="size-4" />
                          </Button>
                          <Button asChild size="sm" variant="ghost" title={isAdmin ? "Editar" : "Ver"}>
                            <Link to="/templates/$machine" params={{ machine: m.id }}>
                              {isAdmin ? <Pencil className="size-4" /> : <Eye className="size-4" />}
                            </Link>
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(m.id, t.id, machine?.activeTemplateId === t.id)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {isAdmin ? (
                  <>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => seedOne(m.id)}>
                        <Plus className="size-4" /> Plantilla inicial
                      </Button>
                      <Button asChild size="sm" className="flex-1">
                        <Link to="/templates/$machine" params={{ machine: m.id }}>
                          Editar
                        </Link>
                      </Button>
                    </div>
                    <div>
                      <input
                        ref={(el) => {
                          importInputs.current[m.id] = el;
                        }}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleImport(m.id, f);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => importInputs.current[m.id]?.click()}
                      >
                        <Upload className="size-4" /> Importar JSON
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link to="/templates/$machine" params={{ machine: m.id }}>
                      <Eye className="size-4" /> Ver plantilla
                    </Link>
                  </Button>
                )}

              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

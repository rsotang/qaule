import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listMachines, listTemplates, saveTemplate, setActiveTemplate } from "@/lib/qa/db";
import { MACHINES, type MachineId } from "@/lib/qa/types";
import { buildSeedTemplate } from "@/lib/qa/seed";
import { toast } from "sonner";
import { Plus, Pencil, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/templates")({ component: TemplatesIndex });

function TemplatesIndex() {
  const qc = useQueryClient();
  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });
  const templates = useQuery({ queryKey: ["templates-all"], queryFn: () => listTemplates() });

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plantillas</h1>
        <p className="text-sm text-muted-foreground">
          Define qué tests extraer y en qué celdas se encuentran. Cada máquina tiene su plantilla activa.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {MACHINES.map((m) => {
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
                          {machine?.activeTemplateId !== t.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => activate(m.id, t.id)}
                            >
                              Activar
                            </Button>
                          )}
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/templates/$machine" params={{ machine: m.id }}>
                              <Pencil className="size-4" />
                            </Link>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

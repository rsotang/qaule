import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listImports, listMachines, listMeasurements, listTemplates } from "@/lib/qa/db";
import { CATEGORY_LABELS, MACHINES, type Category, type Frequency, type MachineId } from "@/lib/qa/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TestChart } from "@/components/qa/TestChart";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const [machineId, setMachineId] = useState<MachineId>("TB1");
  const [category, setCategory] = useState<Category | "all">("all");
  const [frequency, setFrequency] = useState<Frequency | "all">("all");

  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });
  const templates = useQuery({
    queryKey: ["templates", machineId],
    queryFn: () => listTemplates(machineId),
  });
  const measurements = useQuery({
    queryKey: ["measurements", machineId],
    queryFn: () => listMeasurements(machineId),
  });
  const imports = useQuery({
    queryKey: ["imports", machineId],
    queryFn: () => listImports(machineId),
  });

  const machine = machines.data?.find((m) => m.id === machineId);
  const activeTemplate = templates.data?.find((t) => t.id === machine?.activeTemplateId)
    ?? templates.data?.[0];

  const tests = useMemo(() => {
    if (!activeTemplate) return [];
    return activeTemplate.tests.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (frequency !== "all" && t.frequency !== frequency) return false;
      return true;
    });
  }, [activeTemplate, category, frequency]);

  const lastImport = imports.data?.[imports.data.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panel QA</h1>
          <p className="text-sm text-muted-foreground">
            Evolución temporal de parámetros de control de calidad
          </p>
        </div>
        <Tabs value={machineId} onValueChange={(v) => setMachineId(v as MachineId)}>
          <TabsList>
            {MACHINES.map((m) => (
              <TabsTrigger key={m.id} value={m.id}>
                {m.id}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Plantilla activa" value={activeTemplate?.name ?? "—"} hint={activeTemplate ? `${activeTemplate.tests.length} tests` : "Sin plantilla"} />
        <StatCard
          label="Última importación"
          value={lastImport ? lastImport.sourceDate : "—"}
          hint={lastImport?.fileName ?? "Sin datos"}
        />
        <StatCard
          label="Total importaciones"
          value={String(imports.data?.length ?? 0)}
          hint={`${measurements.data?.length ?? 0} medidas`}
        />
      </div>

      {!activeTemplate && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay plantilla para {machineId}.{" "}
            <Link to="/templates" className="text-primary underline">
              Crear una plantilla
            </Link>
          </CardContent>
        </Card>
      )}

      {activeTemplate && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect
              label="Categoría"
              value={category}
              onChange={(v) => setCategory(v as Category | "all")}
              options={[
                { value: "all", label: "Todas" },
                ...Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l })),
              ]}
            />
            <FilterSelect
              label="Frecuencia"
              value={frequency}
              onChange={(v) => setFrequency(v as Frequency | "all")}
              options={[
                { value: "all", label: "Todas" },
                { value: "monthly", label: "Mensual" },
                { value: "quarterly", label: "Trimestral" },
                { value: "annual", label: "Anual" },
              ]}
            />
            <span className="text-xs text-muted-foreground">
              Mostrando {tests.length} de {activeTemplate.tests.length} tests
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tests.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm leading-tight">{t.name}</CardTitle>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {t.frequency === "monthly" ? "M" : t.frequency === "quarterly" ? "T" : "A"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    <span>{CATEGORY_LABELS[t.category]}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <TestChart test={t} measurements={measurements.data ?? []} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

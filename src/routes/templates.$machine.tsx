import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Save, Upload, Wand2, Copy } from "lucide-react";
import { toast } from "sonner";
import { CellPicker } from "@/components/qa/CellPicker";
import {
  getTemplate,
  listTemplates,
  saveTemplate,
  setActiveTemplate,
} from "@/lib/qa/db";
import { readFile, type ParsedWorkbook } from "@/lib/qa/excel";
import { autoBuildTemplate, buildSeedTemplate, cloneTemplateForMachine } from "@/lib/qa/seed";
import { MACHINES } from "@/lib/qa/types";
import {
  CATEGORY_LABELS,
  type Category,
  type Frequency,
  type MachineId,
  type Template,
  type TestDef,
  type Tolerance,
} from "@/lib/qa/types";

export const Route = createFileRoute("/templates/$machine")({ component: TemplateEditor });

function TemplateEditor() {
  const { machine } = Route.useParams();
  const machineId = machine as MachineId;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const templates = useQuery({
    queryKey: ["templates", machineId],
    queryFn: () => listTemplates(machineId),
  });

  const [template, setTemplate] = useState<Template | null>(null);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [editingTestIdx, setEditingTestIdx] = useState<number | null>(null);

  // Load or seed
  useEffect(() => {
    if (template || !templates.data) return;
    if (templates.data.length > 0) {
      setTemplate(templates.data[0]);
    } else {
      const seed = buildSeedTemplate(machineId);
      seed.id = `tpl-${machineId}-${Date.now()}`;
      setTemplate(seed);
    }
  }, [templates.data, machineId, template]);

  async function handleSampleFile(file: File) {
    try {
      const { parsed } = await readFile(file);
      setParsed(parsed);
      toast.success("Archivo de referencia cargado. Ya puedes elegir celdas o auto-detectar tests.");
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  function handleAutoDetect() {
    if (!parsed) {
      toast.error("Carga primero un archivo de referencia");
      return;
    }
    const auto = autoBuildTemplate(parsed, machineId);
    if (auto.tests.length === 0) {
      toast.error("No se detectó ningún código de test (formato esperado: 'MLC 10.12')");
      return;
    }
    setTemplate(auto);
    setEditingTestIdx(null);
    toast.success(`Detectados ${auto.tests.length} tests. Revisa y guarda.`);
  }

  async function handleSave() {
    if (!template) return;
    await saveTemplate(template);
    await setActiveTemplate(machineId, template.id);
    toast.success("Plantilla guardada y activada");
    qc.invalidateQueries();
  }

  async function handleApplyToAll() {
    if (!template) return;
    const others = MACHINES.filter((m) => m.id !== machineId);
    for (const m of others) {
      const clone = cloneTemplateForMachine(template, m.id);
      clone.name = template.name;
      await saveTemplate(clone);
      await setActiveTemplate(m.id, clone.id);
    }
    // also save current machine
    await saveTemplate(template);
    await setActiveTemplate(machineId, template.id);
    toast.success(`Plantilla aplicada a ${others.map((m) => m.id).join(", ")} y ${machineId}`);
    qc.invalidateQueries();
  }


  function loadTemplate(id: string) {
    const t = templates.data?.find((x) => x.id === id);
    if (t) {
      setTemplate(t);
      setEditingTestIdx(null);
    }
  }

  function addTest() {
    if (!template) return;
    const newTest: TestDef = {
      id: `test-${Date.now()}`,
      name: "Nuevo test",
      category: "mechanical_unit",
      frequency: "monthly",
      unit: "",
      tolerance: { type: "abs", delta: 1 },
      cells: [],
    };
    setTemplate({ ...template, tests: [...template.tests, newTest] });
    setEditingTestIdx(template.tests.length);
  }

  function updateTest(idx: number, patch: Partial<TestDef>) {
    if (!template) return;
    const tests = [...template.tests];
    tests[idx] = { ...tests[idx], ...patch };
    setTemplate({ ...template, tests });
  }

  function deleteTest(idx: number) {
    if (!template) return;
    const tests = template.tests.filter((_, i) => i !== idx);
    setTemplate({ ...template, tests });
    if (editingTestIdx === idx) setEditingTestIdx(null);
  }

  function onPickCell(ref: { sheet: string; address: string }) {
    if (!template || editingTestIdx == null) {
      toast.info("Selecciona o crea un test antes de elegir celdas");
      return;
    }
    const t = template.tests[editingTestIdx];
    const existing = t.cells.findIndex((c) => c.sheet === ref.sheet && c.address === ref.address);
    let cells;
    if (existing >= 0) {
      cells = t.cells.filter((_, i) => i !== existing);
    } else {
      cells = [...t.cells, { ...ref, label: `c${t.cells.length + 1}` }];
    }
    updateTest(editingTestIdx, { cells });
  }

  const selectedCells = useMemo(() => {
    if (!template || editingTestIdx == null) return [];
    return template.tests[editingTestIdx]?.cells ?? [];
  }, [template, editingTestIdx]);

  if (!template) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            onClick={() => navigate({ to: "/templates" })}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Volver a plantillas
          </button>
          <h1 className="text-2xl font-semibold">Editor — {machineId}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {templates.data && templates.data.length > 0 && (
            <Select value={template.id} onValueChange={loadTemplate}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templates.data.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsm,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleSampleFile(e.target.files[0])}
            />
            <Button variant="outline" asChild>
              <span>
                <Upload className="size-4" /> Cargar archivo de referencia
              </span>
            </Button>
          </label>
          <Button variant="outline" onClick={handleAutoDetect} disabled={!parsed}>
            <Wand2 className="size-4" /> Auto-detectar tests
          </Button>
          <Button variant="outline" onClick={handleApplyToAll}>
            <Copy className="size-4" /> Aplicar a TB1/TB2/TB3
          </Button>
          <Button onClick={handleSave}>
            <Save className="size-4" /> Guardar y activar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        {/* Tests list */}
        <Card className="lg:max-h-[78vh] lg:overflow-auto">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Tests ({template.tests.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={addTest}>
                <Plus className="size-4" /> Añadir
              </Button>
            </div>
            <div className="space-y-1 pt-2">
              <Label className="text-xs">Nombre plantilla</Label>
              <Input
                value={template.name}
                onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {template.tests.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setEditingTestIdx(i)}
                className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                  editingTestIdx === i ? "border-primary bg-primary/10" : "hover:bg-accent"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{t.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{t.cells.length} celda(s)</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[9px]">
                    {CATEGORY_LABELS[t.category]}
                  </Badge>
                  {t.energy && (
                    <Badge variant="outline" className="text-[9px]">
                      {t.energy}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[9px]">
                    {t.frequency === "monthly" ? "M" : t.frequency === "quarterly" ? "T" : "A"}
                  </Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Editor & picker */}
        <div className="space-y-4">
          {editingTestIdx != null && template.tests[editingTestIdx] ? (
            <TestEditor
              test={template.tests[editingTestIdx]}
              onChange={(patch) => updateTest(editingTestIdx, patch)}
              onDelete={() => deleteTest(editingTestIdx)}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Selecciona un test de la izquierda, o añade uno nuevo
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Selector de celdas</CardTitle>
              <p className="text-xs text-muted-foreground">
                {parsed
                  ? editingTestIdx != null
                    ? "Haz clic en una celda para añadirla/quitarla del test seleccionado"
                    : "Selecciona un test arriba para asociar celdas"
                  : "Carga un archivo .xlsm de referencia (arriba a la derecha) para empezar a elegir celdas"}
              </p>
            </CardHeader>
            <CardContent>
              {parsed ? (
                <CellPicker
                  parsed={parsed}
                  initialSheet={selectedCells[0]?.sheet}
                  selected={selectedCells}
                  onPick={onPickCell}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin archivo de referencia
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TestEditor({
  test,
  onChange,
  onDelete,
}: {
  test: TestDef;
  onChange: (patch: Partial<TestDef>) => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Editar test</CardTitle>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre">
            <Input value={test.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label="Categoría">
            <Select value={test.category} onValueChange={(v) => onChange({ category: v as Category })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Energía (opcional)">
            <Input
              value={test.energy ?? ""}
              placeholder="6 MV, 10 MV, 6 MeV…"
              onChange={(e) => onChange({ energy: e.target.value || undefined })}
            />
          </Field>
          <Field label="Frecuencia">
            <Select value={test.frequency} onValueChange={(v) => onChange({ frequency: v as Frequency })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensual</SelectItem>
                <SelectItem value="quarterly">Trimestral</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Unidad">
            <Input
              value={test.unit ?? ""}
              placeholder="mm, %, cm, °…"
              onChange={(e) => onChange({ unit: e.target.value })}
            />
          </Field>
          <Field label="Tipo tolerancia">
            <Select
              value={test.tolerance.type}
              onValueChange={(v) => {
                const type = v as Tolerance["type"];
                if (type === "pm") onChange({ tolerance: { type, nominal: 0, delta: 1 } });
                else if (type === "abs") onChange({ tolerance: { type, delta: 1 } });
                else if (type === "range") onChange({ tolerance: { type, min: 0, max: 1 } });
                else onChange({ tolerance: { type: "none" } });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pm">± alrededor de nominal</SelectItem>
                <SelectItem value="abs">desviación |x| ≤ Δ</SelectItem>
                <SelectItem value="range">rango min..max</SelectItem>
                <SelectItem value="none">sin tolerancia</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {test.tolerance.type === "pm" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nominal">
              <Input
                type="number"
                step="any"
                value={test.tolerance.nominal}
                onChange={(e) =>
                  onChange({
                    tolerance: {
                      type: "pm",
                      nominal: parseFloat(e.target.value) || 0,
                      delta: test.tolerance.type === "pm" ? test.tolerance.delta : 1,
                    },
                  })
                }
              />
            </Field>
            <Field label="± Δ">
              <Input
                type="number"
                step="any"
                value={test.tolerance.delta}
                onChange={(e) =>
                  onChange({
                    tolerance: {
                      type: "pm",
                      nominal: test.tolerance.type === "pm" ? test.tolerance.nominal : 0,
                      delta: parseFloat(e.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
          </div>
        )}
        {test.tolerance.type === "abs" && (
          <Field label="Δ máxima">
            <Input
              type="number"
              step="any"
              value={test.tolerance.delta}
              onChange={(e) =>
                onChange({ tolerance: { type: "abs", delta: parseFloat(e.target.value) || 0 } })
              }
            />
          </Field>
        )}
        {test.tolerance.type === "range" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mín">
              <Input
                type="number"
                step="any"
                value={test.tolerance.min}
                onChange={(e) =>
                  onChange({
                    tolerance: {
                      type: "range",
                      min: parseFloat(e.target.value) || 0,
                      max: test.tolerance.type === "range" ? test.tolerance.max : 0,
                    },
                  })
                }
              />
            </Field>
            <Field label="Máx">
              <Input
                type="number"
                step="any"
                value={test.tolerance.max}
                onChange={(e) =>
                  onChange({
                    tolerance: {
                      type: "range",
                      min: test.tolerance.type === "range" ? test.tolerance.min : 0,
                      max: parseFloat(e.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
          </div>
        )}


        <div>
          <Label className="text-xs">Celdas mapeadas ({test.cells.length})</Label>
          <div className="mt-1 space-y-1">
            {test.cells.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Selecciona celdas en el panel inferior. Cada celda = una serie/punto.
              </p>
            )}
            {test.cells.map((c, i) => (
              <div key={`${c.sheet}-${c.address}`} className="flex items-center gap-2 rounded border bg-muted/30 p-1.5 text-xs">
                <span className="font-mono">
                  {c.sheet} / {c.address}
                </span>
                <Input
                  value={c.label ?? ""}
                  placeholder="Etiqueta serie"
                  className="h-7 flex-1 text-xs"
                  onChange={(e) => {
                    const cells = [...test.cells];
                    cells[i] = { ...c, label: e.target.value };
                    onChange({ cells });
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  onClick={() => onChange({ cells: test.cells.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

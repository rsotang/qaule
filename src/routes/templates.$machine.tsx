import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { Trash2, Plus, Save, Upload, Wand2, Copy, FolderPlus, FilePlus, ChevronRight, ChevronDown, X, Target } from "lucide-react";
import { toast } from "sonner";
import { CellPicker } from "@/components/qa/CellPicker";
import { listTemplates, saveTemplate, setActiveTemplate } from "@/lib/qa/db";
import { readFile, type ParsedWorkbook } from "@/lib/qa/excel";
import { autoBuildTemplate, buildSeedTemplate, cloneTemplateForMachine } from "@/lib/qa/seed";
import {
  MACHINES,
  CATEGORY_LABELS,
  emptyNest,
  newDataPoint,
  newNest,
  addChild,
  removeNode,
  updateNode,
  walkDataPoints,
  allBoundCells,
  type CellRef,
  type Category,
  type DataPoint,
  type Frequency,
  type MachineId,
  type Nest,
  type Template,
  type TestDef,
  type ToleranceValue,
  type TreeNode,
} from "@/lib/qa/types";

export const Route = createFileRoute("/templates/$machine")({ component: TemplateEditor });

/** What the user is about to fill from a click in the cell picker. */
type TargetSlot =
  | { kind: "dp"; testId: string; dpId: string; field: "cell" | "tolerance" }
  | { kind: "admin"; testId: string; field: "date" }
  | { kind: "admin-performer"; testId: string; index: number };

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
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [target, setTarget] = useState<TargetSlot | null>(null);

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

  const editingTest = template?.tests.find((t) => t.id === editingTestId) ?? null;

  function patchTest(testId: string, patch: (t: TestDef) => TestDef) {
    if (!template) return;
    setTemplate({
      ...template,
      tests: template.tests.map((t) => (t.id === testId ? patch(t) : t)),
    });
  }

  async function handleSampleFile(file: File) {
    try {
      const { parsed } = await readFile(file);
      setParsed(parsed);
      toast.success("Archivo de referencia cargado");
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  function handleAutoDetect() {
    if (!parsed) return toast.error("Carga primero un archivo de referencia");
    const auto = autoBuildTemplate(parsed, machineId);
    if (auto.tests.length === 0) return toast.error("No se detectó ningún test");
    setTemplate(auto);
    setEditingTestId(auto.tests[0]?.id ?? null);
    toast.success(`Detectados ${auto.tests.length} tests`);
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
    await saveTemplate(template);
    await setActiveTemplate(machineId, template.id);
    toast.success(`Aplicada a TB1/TB2/TB3`);
    qc.invalidateQueries();
  }

  function loadTemplate(id: string) {
    const t = templates.data?.find((x) => x.id === id);
    if (t) {
      setTemplate(t);
      setEditingTestId(t.tests[0]?.id ?? null);
    }
  }

  function addTest() {
    if (!template) return;
    const t: TestDef = {
      id: `test-${Date.now()}`,
      name: "Nuevo test",
      category: "mechanical_unit",
      frequency: "monthly",
      admin: {},
      root: emptyNest("raíz"),
    };
    setTemplate({ ...template, tests: [...template.tests, t] });
    setEditingTestId(t.id);
  }

  function deleteTest(id: string) {
    if (!template) return;
    setTemplate({ ...template, tests: template.tests.filter((t) => t.id !== id) });
    if (editingTestId === id) setEditingTestId(null);
  }

  function onPickCell(ref: { sheet: string; address: string }) {
    if (!editingTest || !target) {
      toast.info("Activa un destino (📍) antes de elegir celda");
      return;
    }
    if (target.kind === "dp" && target.testId === editingTest.id) {
      patchTest(target.testId, (t) => ({
        ...t,
        root: updateNode(t.root, target.dpId, (n) =>
          n.kind === "data"
            ? target.field === "cell"
              ? { ...n, cell: ref }
              : { ...n, tolerance: { kind: "cellRef", sheet: ref.sheet, address: ref.address } }
            : n,
        ),
      }));
    } else if (target.kind === "admin" && target.field === "date") {
      patchTest(target.testId, (t) => ({ ...t, admin: { ...t.admin, date: ref } }));
    } else if (target.kind === "admin-performer") {
      patchTest(target.testId, (t) => {
        const performers = [...(t.admin.performers ?? [])];
        performers[target.index] = ref;
        return { ...t, admin: { ...t.admin, performers } };
      });
    }
  }

  const selectedCells: CellRef[] = editingTest ? allBoundCells(editingTest) : [];

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
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
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
              <span><Upload className="size-4" /> Archivo referencia</span>
            </Button>
          </label>
          <Button variant="outline" onClick={handleAutoDetect} disabled={!parsed}>
            <Wand2 className="size-4" /> Auto-detectar
          </Button>
          <Button variant="outline" onClick={handleApplyToAll}>
            <Copy className="size-4" /> Aplicar a TB1/TB2/TB3
          </Button>
          <Button onClick={handleSave}>
            <Save className="size-4" /> Guardar y activar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
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
            {template.tests.map((t) => {
              const dpCount = walkDataPoints(t).length;
              const isActive = editingTestId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setEditingTestId(t.id)}
                  className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                    isActive ? "border-primary bg-primary/10" : "hover:bg-accent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{dpCount} dato(s)</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-[9px]">{CATEGORY_LABELS[t.category]}</Badge>
                    <Badge variant="outline" className="text-[9px]">
                      {t.frequency === "monthly" ? "M" : t.frequency === "quarterly" ? "T" : "A"}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Editor + picker */}
        <div className="min-w-0 space-y-4">

          {editingTest ? (
            <TestEditor
              test={editingTest}
              onChange={(patch) => patchTest(editingTest.id, (t) => ({ ...t, ...patch }))}
              onTreeChange={(root) => patchTest(editingTest.id, (t) => ({ ...t, root }))}
              onDelete={() => deleteTest(editingTest.id)}
              target={target}
              setTarget={setTarget}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Selecciona o añade un test
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Selector de celdas</CardTitle>
                {target && (
                  <Badge variant="default" className="gap-1 text-[10px]">
                    <Target className="size-3" /> {describeTarget(target, editingTest)}
                    <button onClick={() => setTarget(null)} className="ml-1">
                      <X className="size-3" />
                    </button>
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {parsed
                  ? target
                    ? "Haz clic en una celda para asignarla al destino activo"
                    : "Activa un destino (📍) en el editor para empezar a asignar celdas"
                  : "Carga un archivo .xlsm de referencia para empezar"}
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
                <p className="py-8 text-center text-sm text-muted-foreground">Sin archivo de referencia</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function describeTarget(target: TargetSlot, test: TestDef | null): string {
  if (!test) return "—";
  if (target.kind === "admin") return `${test.name} → fecha`;
  if (target.kind === "admin-performer") return `${test.name} → operador #${target.index + 1}`;
  // dp
  const walk = walkDataPoints(test).find((w) => w.dp.id === target.dpId);
  const name = walk ? [...walk.path, walk.dp.name].join(" / ") : "?";
  return `${name} → ${target.field === "cell" ? "celda valor" : "tolerancia (ref)"}`;
}

// ---------------- TestEditor ----------------

function TestEditor({
  test,
  onChange,
  onTreeChange,
  onDelete,
  target,
  setTarget,
}: {
  test: TestDef;
  onChange: (patch: Partial<TestDef>) => void;
  onTreeChange: (root: Nest) => void;
  onDelete: () => void;
  target: TargetSlot | null;
  setTarget: (t: TargetSlot | null) => void;
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
      <CardContent className="space-y-4">
        {/* Test metadata */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Nombre">
            <Input value={test.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label="Categoría">
            <Select value={test.category} onValueChange={(v) => onChange({ category: v as Category })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Frecuencia">
            <Select value={test.frequency} onValueChange={(v) => onChange({ frequency: v as Frequency })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensual</SelectItem>
                <SelectItem value="quarterly">Trimestral</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Admin block */}
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Datos administrativos</p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-24 text-muted-foreground">Fecha:</span>
              <CellChip
                cell={test.admin.date}
                active={target?.kind === "admin" && target.testId === test.id}
                onActivate={() => setTarget({ kind: "admin", testId: test.id, field: "date" })}
                onClear={() => onChange({ admin: { ...test.admin, date: undefined } })}
              />
            </div>
            <div className="flex items-start gap-2">
              <span className="w-24 pt-1 text-muted-foreground">Operadores:</span>
              <div className="flex flex-1 flex-wrap items-center gap-1">
                {(test.admin.performers ?? []).map((p, i) => (
                  <CellChip
                    key={i}
                    cell={p}
                    active={target?.kind === "admin-performer" && target.testId === test.id && target.index === i}
                    onActivate={() => setTarget({ kind: "admin-performer", testId: test.id, index: i })}
                    onClear={() => {
                      const performers = (test.admin.performers ?? []).filter((_, j) => j !== i);
                      onChange({ admin: { ...test.admin, performers } });
                    }}
                  />
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={() => {
                    const performers = [...(test.admin.performers ?? []), { sheet: "", address: "" } as CellRef];
                    onChange({ admin: { ...test.admin, performers } });
                    setTarget({ kind: "admin-performer", testId: test.id, index: performers.length - 1 });
                  }}
                >
                  <Plus className="size-3" /> añadir
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Tree */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase text-muted-foreground">Estructura de datos</p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onTreeChange(addChild(test.root, test.root.id, newNest("Nuevo grupo")))}
              >
                <FolderPlus className="size-3" /> nest
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onTreeChange(addChild(test.root, test.root.id, newDataPoint("Nuevo dato")))}
              >
                <FilePlus className="size-3" /> dato
              </Button>
            </div>
          </div>
          {test.root.children.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              Añade un grupo (nest) o un dato. Los grupos pueden contener otros grupos o datos.
            </p>
          )}
          <div className="space-y-1">
            {test.root.children.map((child) => (
              <TreeNodeView
                key={child.id}
                node={child}
                depth={0}
                test={test}
                target={target}
                setTarget={setTarget}
                onUpdate={(id, patch) => onTreeChange(updateNode(test.root, id, patch))}
                onAddChild={(parentId, kind) =>
                  onTreeChange(
                    addChild(test.root, parentId, kind === "nest" ? newNest() : newDataPoint()),
                  )
                }
                onRemove={(id) => onTreeChange(removeNode(test.root, id))}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- TreeNodeView ----------------

function TreeNodeView({
  node,
  depth,
  test,
  target,
  setTarget,
  onUpdate,
  onAddChild,
  onRemove,
}: {
  node: TreeNode;
  depth: number;
  test: TestDef;
  target: TargetSlot | null;
  setTarget: (t: TargetSlot | null) => void;
  onUpdate: (id: string, patch: (n: TreeNode) => TreeNode) => void;
  onAddChild: (parentId: string, kind: "nest" | "data") => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const pad = { paddingLeft: `${depth * 16}px` };

  if (node.kind === "nest") {
    return (
      <div>
        <div className="flex items-center gap-1 rounded-md border bg-card p-1.5" style={pad}>
          <button onClick={() => setOpen(!open)} className="text-muted-foreground">
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
          <Input
            value={node.name}
            onChange={(e) => onUpdate(node.id, (n) => ({ ...n, name: e.target.value }))}
            className="h-7 flex-1 text-xs font-medium"
          />
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => onAddChild(node.id, "nest")}>
            <FolderPlus className="size-3" /> nest
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => onAddChild(node.id, "data")}>
            <FilePlus className="size-3" /> dato
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={() => onRemove(node.id)}>
            <Trash2 className="size-3 text-destructive" />
          </Button>
        </div>
        {open && node.children.length > 0 && (
          <div className="mt-1 space-y-1">
            {node.children.map((c) => (
              <TreeNodeView
                key={c.id}
                node={c}
                depth={depth + 1}
                test={test}
                target={target}
                setTarget={setTarget}
                onUpdate={onUpdate}
                onAddChild={onAddChild}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Data point row
  const dp = node;
  const cellActive = target?.kind === "dp" && target.dpId === dp.id && target.field === "cell";
  const tolActive = target?.kind === "dp" && target.dpId === dp.id && target.field === "tolerance";
  const tolKind = dp.tolerance?.kind ?? "literal";

  return (
    <div className="rounded-md border bg-muted/20 p-1.5" style={pad}>
      <div className="flex flex-wrap items-center gap-1">
        <Input
          value={dp.name}
          onChange={(e) => onUpdate(dp.id, (n) => ({ ...(n as DataPoint), name: e.target.value }))}
          placeholder="Nombre del dato"
          className="h-7 w-48 text-xs"
        />
        <CellChip
          cell={dp.cell}
          active={cellActive}
          onActivate={() => setTarget({ kind: "dp", testId: test.id, dpId: dp.id, field: "cell" })}
          onClear={() => onUpdate(dp.id, (n) => ({ ...(n as DataPoint), cell: undefined }))}
        />
        <Input
          value={dp.unit ?? ""}
          onChange={(e) => onUpdate(dp.id, (n) => ({ ...(n as DataPoint), unit: e.target.value }))}
          placeholder="unidad"
          className="h-7 w-20 text-xs"
        />
        <Select
          value={tolKind}
          onValueChange={(v) => {
            const next: ToleranceValue =
              v === "literal"
                ? { kind: "literal", text: dp.tolerance?.kind === "literal" ? dp.tolerance.text : "" }
                : dp.tolerance?.kind === "cellRef"
                  ? dp.tolerance
                  : { kind: "cellRef", sheet: "", address: "" };
            onUpdate(dp.id, (n) => ({ ...(n as DataPoint), tolerance: next }));
          }}
        >
          <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="literal">tol. texto</SelectItem>
            <SelectItem value="cellRef">tol. celda</SelectItem>
          </SelectContent>
        </Select>
        {tolKind === "literal" ? (
          <Input
            value={dp.tolerance?.kind === "literal" ? dp.tolerance.text : ""}
            onChange={(e) =>
              onUpdate(dp.id, (n) => ({
                ...(n as DataPoint),
                tolerance: { kind: "literal", text: e.target.value },
              }))
            }
            placeholder="±2, 1-3, ≤0.5…"
            className="h-7 w-32 text-xs"
          />
        ) : (
          <CellChip
            cell={
              dp.tolerance?.kind === "cellRef"
                ? { sheet: dp.tolerance.sheet, address: dp.tolerance.address }
                : undefined
            }
            active={tolActive}
            onActivate={() => setTarget({ kind: "dp", testId: test.id, dpId: dp.id, field: "tolerance" })}
            onClear={() =>
              onUpdate(dp.id, (n) => ({
                ...(n as DataPoint),
                tolerance: { kind: "cellRef", sheet: "", address: "" },
              }))
            }
          />
        )}
        <Button size="icon" variant="ghost" className="size-7" onClick={() => onRemove(dp.id)}>
          <Trash2 className="size-3 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ---------------- bits ----------------

function CellChip({
  cell,
  active,
  onActivate,
  onClear,
}: {
  cell?: CellRef;
  active: boolean;
  onActivate: () => void;
  onClear: () => void;
}) {
  const hasCell = cell && cell.sheet && cell.address;
  return (
    <span className="inline-flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[10px] font-mono">
      <button
        onClick={onActivate}
        className={`inline-flex items-center gap-1 ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        title={hasCell ? `${cell!.sheet}!${cell!.address}` : "Activar para seleccionar"}
      >
        <Target className={`size-3 ${active ? "text-primary" : ""}`} />
        {hasCell ? `${truncate(cell!.sheet, 10)}!${cell!.address}` : "sin asignar"}
      </button>
      {hasCell && (
        <button onClick={onClear} className="text-muted-foreground hover:text-destructive">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

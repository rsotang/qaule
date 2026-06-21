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
import {
  Trash2, Plus, Save, Upload, Wand2, Copy, FolderPlus, FilePlus,
  ChevronRight, ChevronDown, X, Target, Type, Hash, CopyPlus,
} from "lucide-react";
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
  cloneNodeDeep,
  insertAfter,
  walkDataPoints,
  allBoundCells,
  textValue,
  refValue,
  displayTextOrRef,
  type CellRef,
  type Category,
  type DataPoint,
  type Frequency,
  type MachineId,
  type Nest,
  type Template,
  type TestDef,
  type TextOrRef,
  type TreeNode,
} from "@/lib/qa/types";

export const Route = createFileRoute("/_authenticated/templates/$machine")({ component: TemplateEditor });

/** A field on a tree node that accepts TextOrRef. */
type NodeField = "name" | "unit" | "tolerance" | "reference";

/** What the user is about to fill from a click in the cell picker. */
type TargetSlot =
  | { kind: "node"; testId: string; nodeId: string; field: NodeField } // sets a TextOrRef field
  | { kind: "cell"; testId: string; nodeId: string }                    // sets DataPoint.cell
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
    toast.success(`Aplicada a todas las máquinas`);
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
    if (target.kind === "cell" && target.testId === editingTest.id) {
      patchTest(target.testId, (t) => ({
        ...t,
        root: updateNode(t.root, target.nodeId, (n) =>
          n.kind === "data" ? { ...n, cell: ref } : n,
        ),
      }));
    } else if (target.kind === "node" && target.testId === editingTest.id) {
      patchTest(target.testId, (t) => ({
        ...t,
        root: updateNode(t.root, target.nodeId, (n) => {
          if (n.kind === "nest") {
            return target.field === "name" ? { ...n, name: refValue(ref.sheet, ref.address) } : n;
          }
          const key = target.field;
          return { ...(n as DataPoint), [key]: refValue(ref.sheet, ref.address) } as DataPoint;
        }),
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
            <Copy className="size-4" /> Aplicar a todas
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
                      {t.frequency === "monthly" ? "M" : t.frequency === "quarterly" ? "T" : t.frequency === "semiannual" ? "S" : "A"}
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
  // node or cell
  const walked = walkDataPoints(test);
  const w = walked.find((x) => x.dp.id === target.nodeId);
  const labelFromNode = (() => {
    if (w) return [...w.path.map((p) => displayTextOrRef(p, "?")), displayTextOrRef(w.dp.name, "?")].join(" / ");
    // search nests
    const findNest = (n: Nest): Nest | null => {
      if (n.id === target.nodeId) return n;
      for (const c of n.children) if (c.kind === "nest") { const r = findNest(c); if (r) return r; }
      return null;
    };
    const nest = findNest(test.root);
    return nest ? displayTextOrRef(nest.name, "(grupo)") : "?";
  })();
  if (target.kind === "cell") return `${labelFromNode} → celda valor`;
  return `${labelFromNode} → ${target.field}`;
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
                <SelectItem value="semiannual">Semestral</SelectItem>
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
                onDuplicate={(id) => {
                  const find = (n: TreeNode): TreeNode | null => {
                    if (n.id === id) return n;
                    if (n.kind === "nest") {
                      for (const c of n.children) {
                        const r = find(c);
                        if (r) return r;
                      }
                    }
                    return null;
                  };
                  const original = find(test.root);
                  if (!original) return;
                  onTreeChange(insertAfter(test.root, id, cloneNodeDeep(original)));
                }}
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
  onDuplicate,
}: {
  node: TreeNode;
  depth: number;
  test: TestDef;
  target: TargetSlot | null;
  setTarget: (t: TargetSlot | null) => void;
  onUpdate: (id: string, patch: (n: TreeNode) => TreeNode) => void;
  onAddChild: (parentId: string, kind: "nest" | "data") => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const pad = { paddingLeft: `${depth * 16}px` };

  if (node.kind === "nest") {
    const nameActive =
      target?.kind === "node" && target.nodeId === node.id && target.field === "name";
    return (
      <div>
        <div className="flex items-center gap-1 rounded-md border bg-card p-1.5" style={pad}>
          <button onClick={() => setOpen(!open)} className="text-muted-foreground">
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
          <TextOrRefField
            value={node.name}
            placeholder="nombre del grupo"
            active={nameActive}
            onChange={(v) => onUpdate(node.id, (n) => ({ ...(n as Nest), name: v }))}
            onActivate={() =>
              setTarget({ kind: "node", testId: test.id, nodeId: node.id, field: "name" })
            }
            className="flex-1"
          />
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => onAddChild(node.id, "nest")}>
            <FolderPlus className="size-3" /> nest
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => onAddChild(node.id, "data")}>
            <FilePlus className="size-3" /> dato
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onDuplicate(node.id)}
            title="Duplicar grupo"
          >
            <CopyPlus className="size-3" />
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
                onDuplicate={onDuplicate}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Data point row
  const dp = node;
  const isActive = (field: NodeField) =>
    target?.kind === "node" && target.nodeId === dp.id && target.field === field;
  const cellActive = target?.kind === "cell" && target.nodeId === dp.id;

  const setField = (field: NodeField, v: TextOrRef | undefined) =>
    onUpdate(dp.id, (n) => ({ ...(n as DataPoint), [field]: v }) as DataPoint);

  const addOns: { key: "unit" | "tolerance" | "reference"; label: string }[] = [
    { key: "unit", label: "unidad" },
    { key: "tolerance", label: "tolerancia" },
    { key: "reference", label: "referencia" },
  ];
  const missing = addOns.filter((a) => dp[a.key] == null);

  return (
    <div className="rounded-md border bg-muted/20 p-1.5" style={pad}>
      <div className="flex flex-wrap items-center gap-1">
        <TextOrRefField
          value={dp.name}
          placeholder="nombre del dato"
          active={isActive("name")}
          onChange={(v) => setField("name", v)}
          onActivate={() =>
            setTarget({ kind: "node", testId: test.id, nodeId: dp.id, field: "name" })
          }
          className="w-56"
        />
        <CellChip
          cell={dp.cell}
          active={cellActive}
          label="celda valor"
          onActivate={() => setTarget({ kind: "cell", testId: test.id, nodeId: dp.id })}
          onClear={() => onUpdate(dp.id, (n) => ({ ...(n as DataPoint), cell: undefined }))}
        />
        {addOns
          .filter((a) => dp[a.key] != null)
          .map((a) => (
            <div key={a.key} className="flex items-center gap-1 rounded border bg-card px-1 py-0.5">
              <span className="text-[9px] uppercase text-muted-foreground">{a.label}</span>
              <TextOrRefField
                value={dp[a.key]}
                placeholder={a.label}
                active={isActive(a.key)}
                onChange={(v) => setField(a.key, v)}
                onActivate={() =>
                  setTarget({ kind: "node", testId: test.id, nodeId: dp.id, field: a.key })
                }
                className="w-32"
              />
              <button
                onClick={() => setField(a.key, undefined)}
                className="text-muted-foreground hover:text-destructive"
                title={`quitar ${a.label}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        {missing.length > 0 && (
          <Select
            value=""
            onValueChange={(v) => setField(v as NodeField, textValue(""))}
          >
            <SelectTrigger className="h-7 w-[110px] text-[10px]">
              <Plus className="size-3" />
              <SelectValue placeholder="añadir" />
            </SelectTrigger>
            <SelectContent>
              {missing.map((a) => (
                <SelectItem key={a.key} value={a.key} className="text-xs">+ {a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => onDuplicate(dp.id)}
          title="Duplicar dato"
        >
          <CopyPlus className="size-3" />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => onRemove(dp.id)}>
          <Trash2 className="size-3 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ---------------- bits ----------------

/** Edits a TextOrRef: toggle between typed text and a cell reference. */
function TextOrRefField({
  value,
  placeholder,
  active,
  onChange,
  onActivate,
  className,
}: {
  value: TextOrRef | undefined;
  placeholder?: string;
  active: boolean;
  onChange: (v: TextOrRef) => void;
  onActivate: () => void;
  className?: string;
}) {
  const v: TextOrRef = value ?? textValue("");
  const isText = v.kind === "text";

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() =>
          onChange(isText ? { kind: "cellRef", sheet: "", address: "" } : textValue(""))
        }
        className="rounded border bg-card p-1 text-muted-foreground hover:text-foreground"
        title={isText ? "Cambiar a celda" : "Cambiar a texto"}
      >
        {isText ? <Type className="size-3" /> : <Hash className="size-3" />}
      </button>
      {isText ? (
        <Input
          value={v.text}
          onChange={(e) => onChange(textValue(e.target.value))}
          placeholder={placeholder}
          className="h-7 flex-1 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={onActivate}
          className={`inline-flex h-7 flex-1 items-center gap-1 rounded border px-2 text-[10px] font-mono ${
            active ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
          title={v.sheet ? `${v.sheet}!${v.address}` : "Activar y seleccionar celda"}
        >
          <Target className={`size-3 ${active ? "text-primary" : ""}`} />
          {v.sheet && v.address ? `${truncate(v.sheet, 10)}!${v.address}` : "sin asignar"}
        </button>
      )}
    </div>
  );
}

function CellChip({
  cell,
  active,
  label,
  onActivate,
  onClear,
}: {
  cell?: CellRef;
  active: boolean;
  label?: string;
  onActivate: () => void;
  onClear: () => void;
}) {
  const hasCell = cell && cell.sheet && cell.address;
  return (
    <span className="inline-flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[10px] font-mono">
      <button
        onClick={onActivate}
        className={`inline-flex items-center gap-1 ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        title={hasCell ? `${cell!.sheet}!${cell!.address}` : label ?? "Activar para seleccionar"}
      >
        <Target className={`size-3 ${active ? "text-primary" : ""}`} />
        {hasCell ? `${truncate(cell!.sheet, 10)}!${cell!.address}` : label ?? "sin asignar"}
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

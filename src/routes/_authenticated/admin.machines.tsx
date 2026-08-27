import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, Pencil, Layers, Boxes, Check, X } from "lucide-react";
import {
  listMachines,
  createMachine,
  updateMachine,
  deleteMachine,
  createMachineKind,
  updateMachineKind,
  deleteMachineKind,
  createCategory,
  updateCategory,
  deleteCategory,
  listTemplates,
} from "@/lib/qa/db";
import { useMachineCatalog } from "@/hooks/use-machine-catalog";
import { useMeRole } from "@/hooks/use-me-role";
import { MACHINE_ICONS } from "@/lib/qa/types";

export const Route = createFileRoute("/_authenticated/admin/machines")({
  component: MachinesAdminPage,
});

function MachinesAdminPage() {
  const { isAdmin, isViewer } = useMeRole();
  const catalog = useMachineCatalog();
  if (!isAdmin && !isViewer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acceso restringido</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Solo los administradores pueden configurar máquinas.
          </p>
        </CardContent>
      </Card>
    );
  }
  const readOnly = isViewer;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Máquinas y tipos</h1>
        <p className="text-sm text-muted-foreground">
          Configura las máquinas, los tipos de máquina y las categorías de prueba de cada tipo.
        </p>
      </div>
      {catalog.isError && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
          <p className="font-medium">El catálogo de la base de datos no está disponible.</p>
          <p className="mt-0.5 text-amber-700/80">
            Se muestran los tipos y categorías de fábrica. Es posible que la migración de
            "machine_kinds / categories" aún no se haya aplicado en Lovable Cloud; hasta entonces no
            se pueden crear tipos ni categorías nuevos.
          </p>
        </div>
      )}
      <MachinesSection readOnly={readOnly} />
      <MachineKindsSection readOnly={readOnly} catalogUnavailable={catalog.isError} />
      <CategoriesSection readOnly={readOnly} catalogUnavailable={catalog.isError} />
    </div>
  );
}

// ---------------- Machines ----------------

function MachinesSection({ readOnly }: { readOnly: boolean }) {
  const qc = useQueryClient();
  const catalog = useMachineCatalog();
  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<string>("linac");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<string>("linac");

  const create = useMutation({
    mutationFn: () =>
      createMachine({
        id: newId.trim().toUpperCase().replace(/\s+/g, ""),
        name: newName.trim(),
        kind: newKind,
      }),
    onSuccess: () => {
      toast.success("Máquina creada");
      setNewId("");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: () => updateMachine(editId!, { name: editName.trim(), kind: editKind }),
    onSuccess: () => {
      toast.success("Máquina actualizada");
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMachine(id),
    onSuccess: () => {
      toast.success("Máquina eliminada");
      qc.invalidateQueries({ queryKey: ["machines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = machines.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4" /> Máquinas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <form
            className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const machineId = newId.trim().toUpperCase().replace(/\s+/g, "");
              if (!machineId) {
                toast.error("El identificador no puede quedar vacío");
                return;
              }
              if (newId.trim() && newName.trim()) create.mutate();
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Identificador</Label>
              <Input
                className="h-8 w-24"
                placeholder="TB4"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                className="h-8 w-48"
                placeholder="TrueBeam 4"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={newKind} onValueChange={setNewKind}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalog.kinds.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={create.isPending}>
              <Plus className="size-4" /> Añadir
            </Button>
          </form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              {!readOnly && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                {!readOnly && editId === m.id ? (
                  <>
                    <TableCell className="text-xs font-mono">{m.id}</TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={editKind} onValueChange={setEditKind}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.kinds.map((k) => (
                            <SelectItem key={k.id} value={k.id}>
                              {k.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => saveEdit.mutate()}
                          disabled={!editName.trim()}
                        >
                          <Check className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => setEditId(null)}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="text-xs font-mono">{m.id}</TableCell>
                    <TableCell className="text-sm">{m.name}</TableCell>
                    <TableCell className="text-xs">{catalog.kindName(m.kind)}</TableCell>
                    {!readOnly && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => {
                              setEditId(m.id);
                              setEditName(m.name);
                              setEditKind(m.kind ?? "other");
                            }}
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => {
                              if (
                                confirm(
                                  `¿Eliminar la máquina ${m.id}? Las plantillas y datos asociados dejarán de mostrarse.`,
                                )
                              ) {
                                remove.mutate(m.id);
                              }
                            }}
                          >
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------- Machine kinds ----------------

/** Selector del icono que se muestra en el resumen QA para un tipo de máquina. */
function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        title="Sin icono (usa el genérico)"
        className={`rounded-md border px-2 py-1 text-[10px] transition-colors ${
          value === null
            ? "border-primary bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent"
        }`}
      >
        Sin icono
      </button>
      {MACHINE_ICONS.map((ic) => (
        <button
          key={ic.id}
          type="button"
          title={ic.label}
          onClick={() => onChange(ic.id)}
          className={`rounded-md border p-0.5 transition-colors ${
            value === ic.id ? "border-primary ring-1 ring-primary" : "border-border hover:bg-accent"
          }`}
        >
          <img src={`/iconos/${ic.id}.png`} alt={ic.label} className="h-7 w-8 object-contain" />
        </button>
      ))}
    </div>
  );
}

function MachineKindsSection({
  readOnly,
  catalogUnavailable,
}: {
  readOnly: boolean;
  catalogUnavailable: boolean;
}) {
  const qc = useQueryClient();
  const catalog = useMachineCatalog();
  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [editCats, setEditCats] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () =>
      createMachineKind({
        id: newId
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        name: newName.trim(),
        categories: [],
        icon: newIcon,
      }),
    onSuccess: () => {
      toast.success("Tipo creado (sin categorías; edítalo para asignarlas)");
      setNewId("");
      setNewName("");
      setNewIcon(null);
      qc.invalidateQueries({ queryKey: ["machine-kinds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: () =>
      updateMachineKind(editId!, {
        name: editName.trim(),
        categories: editCats,
        icon: editIcon,
      }),
    onSuccess: () => {
      toast.success("Tipo actualizado");
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["machine-kinds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMachineKind(id),
    onSuccess: () => {
      toast.success("Tipo eliminado");
      qc.invalidateQueries({ queryKey: ["machine-kinds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleCat(cat: string) {
    setEditCats((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  const rows = catalog.kinds;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="size-4" /> Tipos de máquina
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cada tipo define qué categorías de prueba pueden usar sus máquinas. Si editas las
          categorías de un tipo que ya tiene plantillas, las pruebas existentes conservan su
          categoría (solo cambia el selector).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <form
            className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const kindId = newId
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
              if (!kindId) {
                toast.error("El identificador no puede quedar vacío");
                return;
              }
              if (newId.trim() && newName.trim()) create.mutate();
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Identificador</Label>
              <Input
                className="h-8 w-40"
                placeholder="brachy"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                className="h-8 w-48"
                placeholder="Braquiterapia"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Icono (resumen QA)</Label>
              <IconPicker value={newIcon} onChange={setNewIcon} />
            </div>
            <Button type="submit" size="sm" disabled={create.isPending || catalogUnavailable}>
              <Plus className="size-4" /> Añadir tipo
            </Button>
          </form>
        )}

        <div className="space-y-2">
          {rows.map((k) => {
            const inUse = machines.data?.filter((m) => m.kind === k.id).length ?? 0;
            return (
              <div key={k.id} className="rounded-md border p-3">
                {!readOnly && editId === k.id ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Nombre</Label>
                        <Input
                          className="h-8 w-56"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => saveEdit.mutate()}
                        disabled={!editName.trim()}
                      >
                        <Check className="size-4" /> Guardar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                        <X className="size-4" /> Cancelar
                      </Button>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium">Icono (resumen QA)</p>
                      <IconPicker value={editIcon} onChange={setEditIcon} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium">Categorías de prueba</p>
                      <div className="flex flex-wrap gap-1.5">
                        {catalog.categories.map((c) => {
                          const on = editCats.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleCat(c.id)}
                              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                                on
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:bg-accent"
                              }`}
                            >
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <img
                          src={`/iconos/${k.icon || "ct"}.png`}
                          alt=""
                          className="h-6 w-7 shrink-0 rounded object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <span className="text-sm font-medium">{k.name}</span>
                        {k.builtin && (
                          <Badge variant="outline" className="text-[9px]">
                            Fábrica
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono">{k.id}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {k.categories.map((c) => (
                          <span
                            key={c}
                            className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {catalog.categoryName(c)}
                          </span>
                        ))}
                        {k.categories.length === 0 && (
                          <span className="text-[10px] text-muted-foreground italic">
                            Sin categorías
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {inUse > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {inUse} máquina{inUse > 1 ? "s" : ""}
                        </span>
                      )}
                      {!readOnly && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => {
                            setEditId(k.id);
                            setEditName(k.name);
                            setEditIcon(k.icon ?? null);
                            setEditCats(k.categories);
                          }}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      )}
                      {!readOnly && !k.builtin && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => {
                            if (inUse > 0) {
                              toast.error(
                                `No se puede eliminar: ${inUse} máquina(s) usan este tipo. Reasigna esas máquinas primero.`,
                              );
                              return;
                            }
                            if (confirm(`¿Eliminar el tipo "${k.name}"?`)) remove.mutate(k.id);
                          }}
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Categories ----------------

function CategoriesSection({
  readOnly,
  catalogUnavailable,
}: {
  readOnly: boolean;
  catalogUnavailable: boolean;
}) {
  const qc = useQueryClient();
  const catalog = useMachineCatalog();
  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });
  const templates = useQuery({ queryKey: ["templates-all"], queryFn: () => listTemplates() });

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createCategory({
        id: newId
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, ""),
        name: newName.trim(),
      }),
    onSuccess: () => {
      toast.success("Categoría creada");
      setNewId("");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: () => updateCategory(editId!, editName.trim()),
    onSuccess: () => {
      toast.success("Categoría actualizada");
      setEditId(null);
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      toast.success("Categoría eliminada");
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = catalog.categories;

  // Máquinas concretas (y nº de plantillas) cuyas plantillas usan cada categoría.
  const machinesByCategory = useMemo(() => {
    const map = new Map<string, { machines: string[]; templates: number }>();
    for (const t of templates.data ?? []) {
      const machineId = t.machineId;
      for (const test of t.tests) {
        const cat = test.category;
        if (!cat) continue;
        const entry = map.get(cat) ?? { machines: [], templates: 0 };
        if (!entry.machines.includes(machineId)) entry.machines.push(machineId);
        entry.templates++;
        map.set(cat, entry);
      }
    }
    return map;
  }, [templates.data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4" /> Categorías de prueba
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Catálogo global de categorías. Al borrar una categoría se quita de todos los tipos que la
          usen; las plantillas que la tengan conservan el texto, pero dejará de ofrecerse en el
          selector.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <form
            className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const catId = newId
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
              if (!catId) {
                toast.error("El identificador no puede quedar vacío");
                return;
              }
              if (newId.trim() && newName.trim()) create.mutate();
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Identificador</Label>
              <Input
                className="h-8 w-48"
                placeholder="brachy_dosimetric"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                className="h-8 w-48"
                placeholder="Dosimétrico Braquiterapia"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={create.isPending || catalogUnavailable}>
              <Plus className="size-4" /> Añadir categoría
            </Button>
          </form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Usada por</TableHead>
              {!readOnly && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const usedBy = catalog.kinds.filter((k) => k.categories.includes(c.id));
              const inUse = machinesByCategory.get(c.id);
              const machineNames = (inUse?.machines ?? [])
                .map((mid) => machines.data?.find((m) => m.id === mid)?.name ?? mid)
                .join(", ");
              return (
                <TableRow key={c.id}>
                  {!readOnly && editId === c.id ? (
                    <>
                      <TableCell className="text-xs font-mono">{c.id}</TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {usedBy.map((k) => k.name).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => saveEdit.mutate()}
                            disabled={!editName.trim()}
                          >
                            <Check className="size-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => setEditId(null)}
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-xs font-mono">{c.id}</TableCell>
                      <TableCell className="text-sm">
                        {c.name}
                        {c.builtin && (
                          <Badge variant="outline" className="ml-2 text-[9px]">
                            Fábrica
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="block text-muted-foreground">
                          {usedBy.map((k) => k.name).join(", ") || "—"}
                        </span>
                        {inUse && (
                          <span className="mt-0.5 block text-[10px] text-muted-foreground/80">
                            {inUse.templates} prueba{inUse.templates > 1 ? "s" : ""} en{" "}
                            {machineNames}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!readOnly && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => {
                                setEditId(c.id);
                                setEditName(c.name);
                              }}
                            >
                              <Pencil className="size-3" />
                            </Button>
                          )}
                          {!readOnly && !c.builtin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => {
                                if (confirm(`¿Eliminar la categoría "${c.name}"?`))
                                  remove.mutate(c.id);
                              }}
                            >
                              <Trash2 className="size-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

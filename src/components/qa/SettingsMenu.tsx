import { useMachineList } from "@/hooks/use-machine-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Settings, Download, Upload, Database, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  clearAllData,
  deleteMeasurement,
  exportAll,
  importAll,
  listImports,
  queryMeasurements,
  updateMeasurement,
} from "@/lib/qa/db";
import type { MachineId, Measurement } from "@/lib/qa/types";
import { MACHINES } from "@/lib/qa/types";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [wiping, setWiping] = useState(false);
  const qc = useQueryClient();

  async function handleBackup() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup descargado");
  }

  async function handleRestore(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAll(data);
      toast.success("Backup restaurado");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  async function handleClear() {
    if (!password) {
      toast.error("Introduce tu contraseña");
      return;
    }
    setWiping(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) throw new Error("Sesión no válida");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Contraseña incorrecta");
      await clearAllData();
      toast.success("Todos los datos borrados");
      setPassword("");
      setWipeOpen(false);
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWiping(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Configuración">
            <Settings className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[360px] sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Configuración</SheetTitle>
            <SheetDescription>Opciones generales y gestión de datos.</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Datos</h3>
              <div className="flex flex-col gap-2">
                <Button variant="outline" className="justify-start" onClick={handleBackup}>
                  <Download className="size-4" /> Descargar backup (JSON)
                </Button>
                <label className="w-full">
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleRestore(e.target.files[0])}
                  />
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <span>
                      <Upload className="size-4" /> Restaurar desde backup
                    </span>
                  </Button>
                </label>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    setOpen(false);
                    setEditorOpen(true);
                  }}
                >
                  <Database className="size-4" /> Editor de base de datos
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Zona peligrosa</h3>
              <Button
                variant="destructive"
                className="w-full justify-start"
                onClick={() => {
                  setPassword("");
                  setWipeOpen(true);
                }}
              >
                <Trash2 className="size-4" /> Borrar todos los datos
              </Button>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={wipeOpen} onOpenChange={(v) => { setWipeOpen(v); if (!v) setPassword(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Borrar todos los datos?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se eliminarán plantillas, importaciones y medidas. Esta acción no se puede deshacer.
            Confirma con tu contraseña para continuar.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleClear();
            }}
          >
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setWipeOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={wiping || !password}>
                {wiping ? "Borrando…" : "Borrar todo"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <DatabaseEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </>
  );
}

const PAGE_SIZE = 50;

function DatabaseEditor({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [machineId, setMachineId] = useState<MachineId | "all">("all");
  const [importId, setImportId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, { value: string; date: string }>>({});

  // Debounce the free-text search so each keystroke doesn't hit the database.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filter = useMemo(
    () => ({
      machineId: machineId === "all" ? undefined : machineId,
      importId: importId === "all" ? undefined : importId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
    }),
    [machineId, importId, dateFrom, dateTo, search],
  );

  const measurements = useQuery({
    queryKey: ["measurements-page", filter, page],
    queryFn: () => queryMeasurements(filter, page, PAGE_SIZE),
    enabled: open,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const imports = useQuery({
    queryKey: ["imports-all"],
    queryFn: () => listImports(),
    enabled: open,
    staleTime: 60_000,
  });

  const importsById = useMemo(() => {
    const map = new Map<string, string>();
    imports.data?.forEach((i) => map.set(i.id, i.fileName));
    return map;
  }, [imports.data]);

  const importOptions = useMemo(() => {
    const list = imports.data ?? [];
    return machineId === "all" ? list : list.filter((i) => i.machineId === machineId);
  }, [imports.data, machineId]);

  const rows = measurements.data?.rows ?? [];
  const total = measurements.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function draftFor(m: Measurement) {
    return drafts[m.id] ?? { value: String(m.value), date: m.date };
  }

  function setDraft(id: string, patch: Partial<{ value: string; date: string }>) {
    setDrafts((d) => ({
      ...d,
      [id]: { ...(d[id] ?? { value: "", date: "" }), ...patch },
    }));
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["measurements-page"] });
    qc.invalidateQueries({ queryKey: ["measurements-all"] });
    qc.invalidateQueries({ queryKey: ["all-measurements"] });
  }

  async function saveRow(m: Measurement) {
    const d = draftFor(m);
    const v = parseFloat(d.value.replace(",", "."));
    if (!isFinite(v)) {
      toast.error("Valor no numérico");
      return;
    }
    await updateMeasurement({ ...m, value: v, date: d.date });
    setDrafts((cur) => {
      const { [m.id]: _omit, ...rest } = cur;
      return rest;
    });
    toast.success("Medida actualizada");
    invalidate();
  }

  async function removeRow(m: Measurement) {
    await deleteMeasurement(m.id);
    toast.success("Medida eliminada");
    invalidate();
  }

  function resetFilters() {
    setMachineId("all");
    setImportId("all");
    setDateFrom("");
    setDateTo("");
    setSearchInput("");
    setSearch("");
    setPage(0);
  }

  function isDirty(m: Measurement) {
    const d = drafts[m.id];
    if (!d) return false;
    return d.value !== String(m.value) || d.date !== m.date;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="size-4" /> Editor de base de datos
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Máquina</label>
            <Select
              value={machineId}
              onValueChange={(v) => {
                setMachineId(v as MachineId | "all");
                setImportId("all");
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {machineList.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.id} — {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Importación</label>
            <Select
              value={importId}
              onValueChange={(v) => {
                setImportId(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {importOptions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.fileName} ({i.sourceDate})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Desde</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              className="w-[150px]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Buscar serie / test</label>
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ej. PDD, 6x, beam center..."
              className="w-[220px]"
            />
          </div>

          <Button variant="outline" size="sm" onClick={resetFilters}>
            Limpiar filtros
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {measurements.isFetching ? "Cargando…" : `${total} medidas`}
            {total > 0 && ` · página ${page + 1} de ${pageCount}`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || measurements.isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount || measurements.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto rounded border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Máquina</TableHead>
                <TableHead>Test</TableHead>
                <TableHead>Serie</TableHead>
                <TableHead>Importación</TableHead>
                <TableHead className="w-[140px]">Fecha</TableHead>
                <TableHead className="w-[120px] text-right">Valor</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    {measurements.isLoading ? "Cargando…" : "No hay medidas."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((m) => {
                  const d = draftFor(m);
                  const dirty = isDirty(m);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.machineId}</TableCell>
                      <TableCell className="text-xs">{m.testId}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.cellLabel}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {importsById.get(m.importId) ?? m.importId}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={d.date}
                          onChange={(e) => setDraft(m.id, { date: e.target.value })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          value={d.value}
                          onChange={(e) => setDraft(m.id, { value: e.target.value })}
                          className="h-8 text-right font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {dirty && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => saveRow(m)}
                              aria-label="Guardar"
                            >
                              <Save className="size-4 text-primary" />
                            </Button>
                          )}
                          {dirty && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                setDrafts((cur) => {
                                  const { [m.id]: _omit, ...rest } = cur;
                                  return rest;
                                })
                              }
                              aria-label="Descartar"
                            >
                              <X className="size-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeRow(m)}
                            aria-label="Eliminar"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

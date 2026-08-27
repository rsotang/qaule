import { createFileRoute, Link } from "@tanstack/react-router";
import { useMachineList } from "@/hooks/use-machine-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Upload, Download, CalendarDays, FolderUp } from "lucide-react";
import { toast } from "sonner";
import {
  deleteImport,
  exportAll,
  importAll,
  listMachines,
  listTemplates,
  queryImports,
  saveImport,
  saveTemplate,
  getCalendar,
  saveCalendar,
  deleteCalendar,
} from "@/lib/qa/db";
import { extractFromTemplate, readFile, resolveImportDate } from "@/lib/qa/excel";
import {
  parseCalendarFile,
  parseCalendarJson,
  calendarToJson,
  readCalendarWorkbook,
  type ParseCalendarResult,
  type CalendarMapping,
  type Grid,
} from "@/lib/qa/calendar-excel";
import { CalendarMapper } from "@/components/qa/CalendarMapper";
import { useMeRole } from "@/hooks/use-me-role";
import type { MachineId, Measurement, CalendarEntry } from "@/lib/qa/types";
import { evaluateTolerance } from "@/lib/qa/types";
import {
  buildMpcTemplate,
  dropEntries,
  groupMpcFiles,
  parseMpcFolder,
  pickerEntries,
  MPC_TEST_ID,
  mpcCellLabel,
  type MpcFolderPreview,
  type MpcFileEntry,
} from "@/lib/qa/mpc";

const MAPPING_KEY = "qaule.calendarMapping";
const MPC_MAX_FOLDERS = 120;

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const Route = createFileRoute("/_authenticated/imports")({ component: ImportsPage });

interface Preview {
  machineId: MachineId;
  fileName: string;
  fileHash: string;
  sourceDate: string;
  rows: {
    testId: string;
    name: string;
    cellLabel: string;
    value: number | null;
    inTol: boolean | null;
  }[];
}

function ImportsPage() {
  const qc = useQueryClient();
  const { isViewer } = useMeRole();
  const readOnly = isViewer;
  const [machineId, setMachineId] = useState<MachineId>("TB1");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const calFileRef = useRef<HTMLInputElement>(null);
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());
  const [calPreview, setCalPreview] = useState<ParseCalendarResult | null>(null);
  const [calFileName, setCalFileName] = useState<string>("");
  const calJsonRef = useRef<HTMLInputElement>(null);
  const mapSrcRef = useRef<HTMLInputElement>(null);
  const mapJsonRef = useRef<HTMLInputElement>(null);
  const [mapping, setMapping] = useState<CalendarMapping | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(MAPPING_KEY);
    try {
      return raw ? (JSON.parse(raw) as CalendarMapping) : null;
    } catch {
      return null;
    }
  });
  const [mapperSource, setMapperSource] = useState<{
    sheetNames: string[];
    sheets: Record<string, Grid>;
  } | null>(null);
  const [mpcMachineId, setMpcMachineId] = useState<MachineId>("TB1");
  const [mpcPreviews, setMpcPreviews] = useState<MpcFolderPreview[]>([]);
  const [mpcDragOver, setMpcDragOver] = useState(false);
  const mpcFolderRef = useRef<HTMLInputElement>(null);

  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });
  const machineList = useMachineList();
  const [importsPage, setImportsPage] = useState(0);
  const IMPORTS_PAGE_SIZE = 15;
  const imports = useQuery({
    queryKey: ["imports-page", importsPage],
    queryFn: () => queryImports(importsPage, IMPORTS_PAGE_SIZE),
    placeholderData: (prev) => prev,
  });
  const importsRows = imports.data?.rows ?? [];
  const importsTotal = imports.data?.total ?? 0;
  const importsPageCount = Math.max(1, Math.ceil(importsTotal / IMPORTS_PAGE_SIZE));
  const calendar = useQuery({ queryKey: ["calendar"], queryFn: getCalendar });

  async function handleFiles(files: File[]) {
    const machine = machines.data?.find((m) => m.id === machineId);
    const templates = await listTemplates(machineId);
    const tpl = templates.find((t) => t.id === machine?.activeTemplateId) ?? templates[0];
    if (!tpl) {
      toast.error(`No hay plantilla para ${machineId}. Crea una primero.`);
      return;
    }
    const added: Preview[] = [];
    for (const file of files) {
      try {
        const { parsed, hash } = await readFile(file);
        const date = resolveImportDate(tpl, parsed) ?? new Date().toISOString().slice(0, 10);
        const values = extractFromTemplate(tpl, parsed);
        const rows = values
          // no guardamos celdas vacías / N/A / errores de Excel
          .filter((v) => v.value != null && Number.isFinite(v.value))
          .map((v) => {
            const test = tpl.tests.find((t) => t.id === v.testId)!;
            return {
              testId: v.testId,
              name: test.name,
              cellLabel: v.cellLabel,
              value: v.value,
              inTol: evaluateTolerance(v.parsedTolerance, v.value as number).inTolerance,
            };
          });
        added.push({ machineId, fileName: file.name, fileHash: hash, sourceDate: date, rows });
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    }
    if (added.length === 0) return;
    setPreviews((prev) => {
      const seen = new Set(prev.map((p) => `${p.machineId}-${p.fileHash}`));
      return [...prev, ...added.filter((p) => !seen.has(`${p.machineId}-${p.fileHash}`))];
    });
  }

  async function commitPreviews() {
    if (previews.length === 0) return;
    let total = 0;
    for (const preview of previews) {
      const importId = `${preview.machineId}-${preview.fileHash.slice(0, 12)}`;
      const measurements: Measurement[] = preview.rows
        .filter((r) => r.value != null && Number.isFinite(r.value))
        .map((r, idx) => ({
          id: `${importId}:${r.testId}:${idx}:${crypto.randomUUID().slice(0, 8)}`,
          importId,
          machineId: preview.machineId,
          testId: r.testId,
          cellLabel: r.cellLabel,
          date: preview.sourceDate,
          value: r.value as number,
        }));
      await saveImport(
        {
          id: importId,
          machineId: preview.machineId,
          fileName: preview.fileName,
          importedAt: new Date().toISOString(),
          sourceDate: preview.sourceDate,
          fileHash: preview.fileHash,
        },
        measurements,
      );
      total += measurements.length;
    }
    toast.success(`${total} medidas importadas de ${previews.length} archivo(s)`);
    setPreviews([]);
    if (fileRef.current) fileRef.current.value = "";
    qc.invalidateQueries();
  }

  async function handleDelete(id: string) {
    await deleteImport(id);
    toast.success("Importación eliminada");
    // If we just deleted the last row of the current page, step back one page.
    if (importsRows.length === 1 && importsPage > 0) {
      setImportsPage((p) => p - 1);
    }
    qc.invalidateQueries();
  }

  async function handleMpcFiles(entries: MpcFileEntry[]) {
    const groups = groupMpcFiles(entries);
    const withResults = [...groups.values()].filter((g) => g.resultsCsv);
    if (withResults.length === 0) {
      toast.error(
        "No se encontraron carpetas MPC con Results.csv. Selecciona la carpeta del mes (o varias).",
      );
      return;
    }
    if (withResults.length > MPC_MAX_FOLDERS) {
      toast.error(
        `Se detectaron ${withResults.length} carpetas. Selecciona solo la carpeta del mes a importar (máx. ${MPC_MAX_FOLDERS}).`,
      );
      return;
    }
    const added: MpcFolderPreview[] = [];
    for (const g of withResults) {
      try {
        const p = await parseMpcFolder(g.folderName, g.resultsCsv!, g.checkXml, mpcMachineId);
        added.push(p);
      } catch (e) {
        toast.error(`${g.folderName}: ${(e as Error).message}`);
      }
    }
    if (added.length === 0) return;
    setMpcPreviews((prev) => {
      const seen = new Set(prev.map((p) => p.importId));
      return [...prev, ...added.filter((p) => !seen.has(p.importId))];
    });
    if (mpcFolderRef.current) mpcFolderRef.current.value = "";
  }

  async function handleMpcDrop(e: DragEvent) {
    e.preventDefault();
    setMpcDragOver(false);
    try {
      const entries = await dropEntries(e.dataTransfer.items);
      if (entries.length === 0) {
        toast.error("No se pudieron leer las carpetas arrastradas.");
        return;
      }
      await handleMpcFiles(entries);
    } catch (err) {
      toast.error(`Error al leer carpetas: ${(err as Error).message}`);
    }
  }

  async function commitMpc() {
    if (mpcPreviews.length === 0) return;
    const machineId = mpcMachineId;
    try {
      const templates = await listTemplates(machineId);
      const existing = templates.find((t) => t.id === `mpc-${machineId}`);
      const tpl = buildMpcTemplate(
        machineId,
        mpcPreviews.flatMap((p) =>
          p.rows.map((r) => ({
            energy: p.energy,
            name: r.name,
            unit: r.unit,
            threshold: r.threshold,
          })),
        ),
        existing,
      );
      await saveTemplate(tpl);

      let total = 0;
      for (const p of mpcPreviews) {
        const measurements: Measurement[] = p.rows.map((r, idx) => ({
          id: `${p.importId}:${idx}:${crypto.randomUUID().slice(0, 8)}`,
          importId: p.importId,
          machineId,
          testId: MPC_TEST_ID,
          cellLabel: mpcCellLabel(p.energy, r.name),
          date: p.date ?? "",
          value: r.value,
        }));
        await saveImport(
          {
            id: p.importId,
            machineId,
            fileName: p.folderName,
            importedAt: new Date().toISOString(),
            sourceDate: p.date ?? "",
            fileHash: p.hash,
          },
          measurements,
        );
        total += measurements.length;
      }
      toast.success(`${total} medidas MPC importadas de ${mpcPreviews.length} carpeta(s)`);
      setMpcPreviews([]);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(`Error al importar MPC: ${(e as Error).message}`);
    }
  }

  async function handleBackup() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `qa-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }
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

  async function handleCalendarFile(file: File) {
    try {
      const result = await parseCalendarFile(file, {
        defaultYear: calYear,
        mapping: mapping ?? undefined,
      });
      setCalPreview(result);
      setCalFileName(file.name);
      toast.success(`${result.entries.length} tests detectados`);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    }
  }

  async function handleCalendarJson(file: File) {
    try {
      const { entries } = parseCalendarJson(await file.text());
      await saveCalendar({
        id: "default",
        updatedAt: new Date().toISOString(),
        fileName: file.name,
        entries,
      });
      toast.success(`Calendario importado (${entries.length} tests)`);
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      if (calJsonRef.current) calJsonRef.current.value = "";
    }
  }

  function exportCalendarJson() {
    const cal = calendar.data;
    if (!cal) return;
    downloadText(
      calendarToJson({ fileName: cal.fileName, updatedAt: cal.updatedAt, entries: cal.entries }),
      "calendario-qaule.json",
    );
  }

  async function handleMapperSource(file: File) {
    try {
      const wb = await readCalendarWorkbook(file);
      setMapperSource(wb);
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      if (mapSrcRef.current) mapSrcRef.current.value = "";
    }
  }

  function saveMapping(m: CalendarMapping) {
    setMapping(m);
    localStorage.setItem(MAPPING_KEY, JSON.stringify(m));
    setMapperSource(null);
    setCalYear(m.defaultYear ?? calYear);
    toast.success("Plantilla de calendario guardada");
  }

  async function handleMappingJson(file: File) {
    try {
      const m = JSON.parse(await file.text()) as CalendarMapping;
      if (!m || typeof m.sheetName !== "string" || typeof m.headerRow !== "number")
        throw new Error("Plantilla no válida");
      setMapping(m);
      localStorage.setItem(MAPPING_KEY, JSON.stringify(m));
      toast.success("Plantilla de calendario cargada");
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      if (mapJsonRef.current) mapJsonRef.current.value = "";
    }
  }

  function clearMapping() {
    setMapping(null);
    localStorage.removeItem(MAPPING_KEY);
  }

  async function commitCalendar() {
    if (!calPreview) return;
    await saveCalendar({
      id: "default",
      updatedAt: new Date().toISOString(),
      fileName: calFileName,
      entries: calPreview.entries,
    });
    toast.success("Calendario guardado");
    setCalPreview(null);
    setCalFileName("");
    if (calFileRef.current) calFileRef.current.value = "";
    qc.invalidateQueries({ queryKey: ["calendar"] });
  }

  async function handleDeleteCalendar() {
    await deleteCalendar();
    toast.success("Calendario eliminado");
    qc.invalidateQueries({ queryKey: ["calendar"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Importaciones</h1>
          <p className="text-sm text-muted-foreground">Sube un archivo .xlsm mensual por máquina</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleBackup}>
            <Download className="size-4" /> Backup
          </Button>
          <label className="cursor-pointer">
            <input
              type="file"
              disabled={readOnly}
              accept=".json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleRestore(e.target.files[0])}
            />
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="size-4" /> Restaurar
              </span>
            </Button>
          </label>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva importación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full space-y-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">Máquina</label>
              <Select value={machineId} onValueChange={(v) => setMachineId(v as MachineId)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {machineList.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id} — {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full space-y-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">
                Archivos .xlsm / .xlsx (varios)
              </label>
              <Input
                ref={fileRef}
                type="file"
                disabled={readOnly}
                multiple
                accept=".xlsm,.xlsx,.xls"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []);
                  if (fs.length) handleFiles(fs);
                }}
                className="w-full sm:w-[320px]"
              />
            </div>
          </div>

          {previews.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {previews.length} archivo(s) · {previews.reduce((n, p) => n + p.rows.length, 0)}{" "}
                  valores válidos
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPreviews([])}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={commitPreviews} disabled={readOnly}>
                    Confirmar importación ({previews.length})
                  </Button>
                </div>
              </div>

              {previews.map((preview) => (
                <div
                  key={`${preview.machineId}-${preview.fileHash}`}
                  className="space-y-3 rounded-md border bg-muted/30 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{preview.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {preview.machineId} • fecha: {preview.sourceDate} • {preview.rows.length}{" "}
                        valores extraídos
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPreviews((prev) => prev.filter((p) => p.fileHash !== preview.fileHash))
                      }
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="max-h-[300px] overflow-auto rounded border bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Test</TableHead>
                          <TableHead>Serie</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Tol.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{r.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.cellLabel}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono">
                              {r.value == null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                r.value.toFixed(4)
                              )}
                            </TableCell>
                            <TableCell>
                              {r.inTol === null ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : r.inTol ? (
                                <span className="text-xs text-green-600">✓</span>
                              ) : (
                                <span className="text-xs font-medium text-destructive">✗</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderUp className="size-4" /> Importación MPC (Varian)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Importa una o varias carpetas a la vez (mes completo con sus Check.xml y Results.csv).
            Se importan todas las medidas y quedan disponibles en Visualización como test «MPC
            (Varian)» → energía → grupo → parámetro.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full space-y-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">Máquina</label>
              <Select value={mpcMachineId} onValueChange={(v) => setMpcMachineId(v as MachineId)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {machineList.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id} — {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[280px] flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">
                Carpetas MPC (varias de golpe: arrastra o selecciona)
              </label>
              <div
                className={`flex flex-row flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 transition-colors ${
                  mpcDragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setMpcDragOver(true);
                }}
                onDragLeave={() => setMpcDragOver(false)}
                onDrop={handleMpcDrop}
              >
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <FolderUp className="size-4 shrink-0" />
                  <span className="truncate">Arrastra aquí las carpetas MPC</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => mpcFolderRef.current?.click()}
                >
                  Seleccionar carpetas
                </Button>
                <Input
                  ref={mpcFolderRef}
                  type="file"
                  disabled={readOnly}
                  multiple
                  className="hidden"
                  // @ts-expect-error webkitdirectory no está tipado en React
                  webkitdirectory=""
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []);
                    if (fs.length) handleMpcFiles(pickerEntries(fs));
                  }}
                />
              </div>
            </div>
          </div>

          {mpcPreviews.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {mpcPreviews.length} carpeta(s) ·{" "}
                  {mpcPreviews.reduce((n, p) => n + p.rows.length, 0)} medidas válidas
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setMpcPreviews([])}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={commitMpc} disabled={readOnly}>
                    Confirmar importación ({mpcPreviews.length})
                  </Button>
                </div>
              </div>

              {mpcPreviews.map((preview) => {
                const fails = preview.rows.filter(
                  (r) => r.threshold != null && Math.abs(r.value) > r.threshold,
                ).length;
                return (
                  <div
                    key={preview.importId}
                    className="space-y-3 rounded-md border bg-muted/30 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{preview.folderName}</p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            preview.serial ? `SN${preview.serial}` : null,
                            preview.date ? `fecha: ${preview.date}` : null,
                            preview.energy ? `energía: ${preview.energy}` : null,
                            preview.templateId,
                          ]
                            .filter(Boolean)
                            .join(" • ")}{" "}
                          · {preview.rows.length} valores
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {preview.evaluation && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              preview.evaluation === "Pass"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {preview.evaluation}
                            {preview.isBaseline ? " · Baseline" : ""}
                          </span>
                        )}
                        {fails > 0 && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                            {fails} fuera de tolerancia
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setMpcPreviews((prev) =>
                              prev.filter((p) => p.importId !== preview.importId),
                            )
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-[300px] overflow-auto rounded border bg-background">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Parámetro</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead className="text-right">Umbral</TableHead>
                            <TableHead className="text-center">Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.rows.map((r, i) => {
                            const ok = r.threshold == null || Math.abs(r.value) <= r.threshold;
                            return (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{r.name}</TableCell>
                                <TableCell className="text-right font-mono text-xs tabular-nums">
                                  {r.value.toFixed(4)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                  {r.threshold == null ? "—" : r.threshold.toFixed(4)}
                                </TableCell>
                                <TableCell className="text-center text-xs">
                                  {r.threshold == null ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : ok ? (
                                    <span className="text-emerald-600">✓</span>
                                  ) : (
                                    <span className="font-medium text-destructive">✗</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4" /> Calendario de QA
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Sube una hoja con los tests programados (filas = test, columnas = meses o fechas).
            Calendario compartido por todas las máquinas.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {calendar.data && !calPreview && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
              <div className="text-xs">
                <p className="font-medium">{calendar.data.fileName ?? "Calendario actual"}</p>
                <p className="text-muted-foreground">
                  {calendar.data.entries.length} tests · actualizado{" "}
                  {new Date(calendar.data.updatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={exportCalendarJson}>
                  <Download className="size-4" /> Exportar JSON
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteCalendar}
                  disabled={readOnly}
                >
                  <Trash2 className="size-4 text-destructive" /> Eliminar
                </Button>
              </div>
            </div>
          )}

          {/* Plantilla de importación del calendario */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <p className="font-medium">Plantilla de importación</p>
                <p className="text-muted-foreground">
                  {mapping
                    ? `${mapping.name ?? "Plantilla"} · hoja "${mapping.sheetName}" · cabecera fila ${mapping.headerRow + 1}`
                    : "Sin plantilla: se detectan cabeceras automáticamente."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => mapSrcRef.current?.click()}>
                  <Upload className="size-4" /> {mapping ? "Reconfigurar" : "Crear con Excel"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => mapJsonRef.current?.click()}>
                  Cargar JSON
                </Button>
                {mapping && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadText(JSON.stringify(mapping, null, 2), "plantilla-calendario.json")
                      }
                    >
                      <Download className="size-4" /> Exportar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearMapping}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <input
              ref={mapSrcRef}
              type="file"
              disabled={readOnly}
              accept=".xlsx,.xls,.xlsm"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleMapperSource(e.target.files[0])}
            />
            <input
              ref={mapJsonRef}
              type="file"
              disabled={readOnly}
              accept=".json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleMappingJson(e.target.files[0])}
            />
            {mapperSource && (
              <CalendarMapper
                sheetNames={mapperSource.sheetNames}
                sheets={mapperSource.sheets}
                initial={mapping}
                onSave={saveMapping}
                onCancel={() => setMapperSource(null)}
              />
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full space-y-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">Año por defecto</label>
              <Input
                type="number"
                value={calYear}
                onChange={(e) =>
                  setCalYear(parseInt(e.target.value || "0", 10) || new Date().getFullYear())
                }
                className="w-[120px]"
              />
            </div>
            <div className="w-full space-y-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">Archivo .xlsx</label>
              <Input
                ref={calFileRef}
                type="file"
                disabled={readOnly}
                accept=".xlsx,.xls,.xlsm"
                onChange={(e) => e.target.files?.[0] && handleCalendarFile(e.target.files[0])}
                className="w-full sm:w-[320px]"
              />
            </div>
            <div className="w-full space-y-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">o archivo .json</label>
              <Input
                ref={calJsonRef}
                type="file"
                disabled={readOnly}
                accept=".json"
                onChange={(e) => e.target.files?.[0] && handleCalendarJson(e.target.files[0])}
                className="w-full sm:w-[260px]"
              />
            </div>
          </div>

          {calPreview && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{calFileName}</p>
                  <p className="text-xs text-muted-foreground">
                    Hoja: {calPreview.sheetName} · {calPreview.detectedColumns.length} columnas
                    detectadas · {calPreview.entries.length} tests
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCalPreview(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={commitCalendar} disabled={readOnly}>
                    Guardar calendario
                  </Button>
                </div>
              </div>
              <div className="max-h-[320px] overflow-auto rounded border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Máquina</TableHead>
                      <TableHead>Test</TableHead>
                      <TableHead>Programación</TableHead>
                      <TableHead>Paciente · Curso · Plan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calPreview.entries.map((e: CalendarEntry, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{e.machineId ?? "Todas"}</TableCell>
                        <TableCell className="text-xs">
                          {e.testName}
                          {e.category && (
                            <span className="block text-[10px] text-muted-foreground">
                              {e.category}
                            </span>
                          )}
                          {e.detail && (
                            <span className="block text-[10px] text-muted-foreground">
                              nota: {e.detail}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[...e.months.map((m) => `mes ${m}`), ...e.dates].join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {[e.patientId, e.course, e.plan].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de importaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {importsTotal === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay importaciones todavía.{" "}
              <Link to="/templates" className="text-primary underline">
                Configura una plantilla
              </Link>{" "}
              y sube tu primer archivo.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {importsTotal} importaciones
                  {importsTotal > IMPORTS_PAGE_SIZE &&
                    ` · página ${importsPage + 1} de ${importsPageCount}`}
                </span>
                {importsPageCount > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={importsPage === 0 || imports.isFetching}
                      onClick={() => setImportsPage((p) => Math.max(0, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={importsPage + 1 >= importsPageCount || imports.isFetching}
                      onClick={() => setImportsPage((p) => p + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Máquina</TableHead>
                    <TableHead>Fecha datos</TableHead>
                    <TableHead>Archivo</TableHead>
                    <TableHead>Importado</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importsRows.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.machineId}</TableCell>
                      <TableCell>{i.sourceDate}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.fileName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(i.importedAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={readOnly}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar esta importación?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se borrarán todas las medidas de «{i.fileName}» ({i.machineId} ·{" "}
                                {i.sourceDate}). Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(i.id)}>
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
import { Trash2, Upload, Download, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import {
  deleteImport,
  exportAll,
  importAll,
  listImports,
  listMachines,
  listTemplates,
  saveImport,
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
import type { MachineId, Measurement, CalendarEntry } from "@/lib/qa/types";
import { MACHINES, evaluateTolerance } from "@/lib/qa/types";

const MAPPING_KEY = "qaule.calendarMapping";

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


export const Route = createFileRoute("/_authenticated/imports")({ component: ImportsPage });

interface Preview {
  machineId: MachineId;
  fileName: string;
  fileHash: string;
  sourceDate: string;
  rows: { testId: string; name: string; cellLabel: string; value: number | null; inTol: boolean | null }[];
}

function ImportsPage() {
  const qc = useQueryClient();
  const [machineId, setMachineId] = useState<MachineId>("TB1");
  const [preview, setPreview] = useState<Preview | null>(null);
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



  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });
  const imports = useQuery({ queryKey: ["imports-all"], queryFn: () => listImports() });
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
          id: `${importId}:${r.testId}:${idx}`,
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
    qc.invalidateQueries();
  }

  async function handleBackup() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
          <p className="text-sm text-muted-foreground">
            Sube un archivo .xlsm mensual por máquina
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleBackup}>
            <Download className="size-4" /> Backup
          </Button>
          <label className="cursor-pointer">
            <input
              type="file"
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
                  {MACHINES.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id} — {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full space-y-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">Archivo .xlsm / .xlsx</label>
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsm,.xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="w-full sm:w-[320px]"
              />
            </div>
          </div>

          {preview && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{preview.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {preview.machineId} • fecha: {preview.sourceDate} •{" "}
                    {preview.rows.filter((r) => r.value != null).length} valores extraídos
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={commitPreview}>
                    Confirmar importación
                  </Button>
                </div>
              </div>
              <div className="max-h-[300px] overflow-auto rounded border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Máquina</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground">{r.cellLabel}</TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {r.value == null ? <span className="text-muted-foreground">—</span> : r.value.toFixed(4)}
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
                <Button variant="ghost" size="sm" onClick={handleDeleteCalendar}>
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
              accept=".xlsx,.xls,.xlsm"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleMapperSource(e.target.files[0])}
            />
            <input
              ref={mapJsonRef}
              type="file"
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
                onChange={(e) => setCalYear(parseInt(e.target.value || "0", 10) || new Date().getFullYear())}
                className="w-[120px]"
              />
            </div>
            <div className="w-full space-y-1 sm:w-auto">
              <label className="text-xs text-muted-foreground">Archivo .xlsx</label>
              <Input
                ref={calFileRef}
                type="file"
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
                    Hoja: {calPreview.sheetName} · {calPreview.detectedColumns.length} columnas detectadas ·{" "}
                    {calPreview.entries.length} tests
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCalPreview(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={commitCalendar}>
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
                      <TableHead>Responsable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calPreview.entries.map((e: CalendarEntry, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{e.machineId ?? "Todas"}</TableCell>
                        <TableCell className="text-xs">
                          {e.testName}
                          {e.category && (
                            <span className="block text-[10px] text-muted-foreground">{e.category}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[
                            ...e.months.map((m) => `mes ${m}`),
                            ...e.dates,
                          ].join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{e.performer ?? "—"}</TableCell>
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
          {imports.data?.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay importaciones todavía. <Link to="/templates" className="text-primary underline">Configura una plantilla</Link> y sube tu primer archivo.
            </p>
          ) : (
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
                {imports.data?.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.machineId}</TableCell>
                    <TableCell>{i.sourceDate}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.fileName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(i.importedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(i.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

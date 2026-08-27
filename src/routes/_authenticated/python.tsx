import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Play,
  Save,
  Trash2,
  Database,
  Upload,
  Eraser,
  Terminal,
  Loader2,
  Download,
  Plus,
} from "lucide-react";
import { getRunner, disposeRunner, type RunnerCallbacks } from "@/lib/python/runner";
import { buildQaContext } from "@/lib/python/bridge";
import { listScripts, saveScript, deleteScript } from "@/lib/python/scripts";
import type { RunnerStatus } from "@/lib/python/types";

export const Route = createFileRoute("/_authenticated/python")({ component: PythonPage });

const DEFAULT_SCRIPT = `# Script de análisis — Python 3.14 (Pyodide) con numpy, scipy,
# scikit-image, matplotlib, pydicom y pylinac ya disponibles.
#
# - Los datos QA de la app llegan en la variable "qa_data"
#   (machines, templates, measurements, imports, calendar...).
# - Los ficheros que subas están en /userfiles/<nombre>.
# - Guarda las figuras en /out/*.png para verlas y descargarlas aquí.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

meds = qa_data.get("measurements", [])
print(f"Mediciones disponibles: {len(meds)}")
for m in meds[:5]:
    print(" ", m["machine_id"], m["cell_label"], "=", m["value"])

# Ejemplo: figura a /out
import numpy as np
x = np.linspace(0, 10, 100)
plt.figure(figsize=(6, 3))
plt.plot(x, np.sin(x))
plt.title("Ejemplo QAULE")
plt.savefig("/out/ejemplo.png", dpi=100)
print("Figura guardada en /out/ejemplo.png");

# pylinac está disponible:
# from pylinac import PicketFence, Starshot, WinstonLutz, ...
`;

// Helper común: results_data es property en pylinac 3.38 y método en versiones nuevas.
const RESULTS_HELPER = `def resultados(obj):
    rd = obj.results_data
    return rd() if callable(rd) else rd

def listar_ficheros():
    import os
    return [f for f in sorted(os.listdir("/userfiles")) if not f.startswith(".")]
`;

const ANALYSIS_TEMPLATES: { id: string; label: string; code: string }[] = [
  {
    id: "picketfence",
    label: "Picket Fence",
    code: `# Análisis Picket Fence — pylinac 3.38.0 personalizado del servicio.
# El nombre del acelerador se extrae automáticamente del DICOM (Radiation Machine Name).
${RESULTS_HELPER}
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pylinac import PicketFence

files = listar_ficheros()
print("Ficheros en /userfiles:", files)
if not files:
    raise SystemExit("Sube un DICOM de Picket Fence antes de ejecutar.")

pf = PicketFence(os.path.join("/userfiles", files[0]))
pf.analyze()
print(resultados(pf))

pf.plot(show=False)
plt.savefig("/out/picketfence.png", dpi=100, bbox_inches="tight")
print("Figura guardada en /out/picketfence.png")
`,
  },
  {
    id: "vmat",
    label: "VMAT",
    code: `# Análisis VMAT (DRGS / DRMLC / DRCS) — pylinac 3.38.0 personalizado del servicio.
# Requiere 2 imágenes: open y MLC. Prueba por defecto: DRMLC (cambia la clase si procede).
${RESULTS_HELPER}
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pylinac.vmat import DRMLC

files = listar_ficheros()
print("Ficheros en /userfiles:", files)
if len(files) < 2:
    raise SystemExit("Sube 2 imágenes DICOM (open y MLC) antes de ejecutar.")

paths = [os.path.join("/userfiles", f) for f in files]
# DRMLC(mlc_image, open_image) — usa el módulo vmat personalizado
test = DRMLC(paths[1], paths[0])
test.analyze()
print(resultados(test))

test.plot(show=False)
plt.savefig("/out/vmat.png", dpi=100, bbox_inches="tight")
print("Figura guardada en /out/vmat.png")
`,
  },
  {
    id: "winston-lutz",
    label: "Winston-Lutz",
    code: `# Análisis Winston-Lutz — pylinac 3.38.0 personalizado del servicio.
# Usa todos los ficheros de /userfiles (imágenes EPID + caja de BB).
${RESULTS_HELPER}
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pylinac import WinstonLutz

files = listar_ficheros()
print("Ficheros en /userfiles:", files)
if not files:
    raise SystemExit("Sube las imágenes de Winston-Lutz antes de ejecutar.")

paths = [os.path.join("/userfiles", f) for f in files]
wl = WinstonLutz(paths)
wl.analyze()
print(resultados(wl))

wl.plot(show=False)
plt.savefig("/out/winston_lutz.png", dpi=100, bbox_inches="tight")
print("Figura guardada en /out/winston_lutz.png")
`,
  },
  {
    id: "ct",
    label: "CT / CatPhan",
    code: `# Análisis CT / CatPhan — pylinac 3.38.0 personalizado del servicio.
# Usa todos los ficheros de /userfiles (serie DICOM del CatPhan).
${RESULTS_HELPER}
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pylinac import CatPhan604

files = listar_ficheros()
print("Ficheros en /userfiles:", files)
if not files:
    raise SystemExit("Sube la serie de imágenes CT antes de ejecutar.")

paths = [os.path.join("/userfiles", f) for f in files]
cp = CatPhan604(paths)
cp.analyze()
print(resultados(cp))

cp.plot(show=False)
plt.savefig("/out/catphan.png", dpi=100, bbox_inches="tight")
print("Figura guardada en /out/catphan.png")
`,
  },
];

interface ConsoleLine {
  kind: "out" | "err" | "info";
  text: string;
}

function statusLabel(s: RunnerStatus | "idle"): {
  text: string;
  tone: "default" | "ok" | "warn" | "err";
} {
  switch (s) {
    case "idle":
      return { text: "Sin iniciar", tone: "default" };
    case "booting":
      return { text: "Arrancando runtime (1ª vez ~30s)", tone: "warn" };
    case "installing":
      return { text: "Instalando paquetes", tone: "warn" };
    case "ready":
      return { text: "Listo", tone: "ok" };
    case "running":
      return { text: "Ejecutando…", tone: "warn" };
    case "error":
      return { text: "Error", tone: "err" };
  }
}

function PythonPage() {
  const qc = useQueryClient();
  const [motor, setMotor] = useState<{ status: RunnerStatus | "idle"; detail?: string }>({
    status: "idle",
  });
  const [code, setCode] = useState(DEFAULT_SCRIPT);
  const [scriptName, setScriptName] = useState("Sin título");
  const [selectedId, setSelectedId] = useState<string>("");
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([
    { kind: "info", text: "Consola de Python. Pulsa Ejecutar para empezar." },
  ]);
  const [images, setImages] = useState<{ name: string; url: string }[]>([]);
  const [includeContext, setIncludeContext] = useState(true);
  const [uploaded, setUploaded] = useState<{ name: string; bytes: ArrayBuffer }[]>([]);
  const [booting, setBooting] = useState(false);
  const [addAnalysis, setAddAnalysis] = useState(false);
  const [analysisName, setAnalysisName] = useState("");
  const consoleRef = useRef<HTMLDivElement>(null);

  const scripts = useQuery({ queryKey: ["python-scripts"], queryFn: () => listScripts("script") });
  const analyses = useQuery({
    queryKey: ["python-analyses"],
    queryFn: () => listScripts("analysis"),
  });

  const appendLine = useCallback((kind: ConsoleLine["kind"], text: string) => {
    setConsoleLines((prev) => {
      const next = [...prev, { kind, text }];
      return next.length > 2000 ? next.slice(next.length - 2000) : next;
    });
    requestAnimationFrame(() => {
      consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
    });
  }, []);

  const callbacks: RunnerCallbacks = {
    onStatus: (status, detail) => {
      setMotor({ status, detail });
      if (status === "ready") appendLine("info", "[motor] Python listo");
      if (status === "error") appendLine("err", `[motor] ${detail ?? "error de arranque"}`);
    },
    onStdout: (text) => appendLine("out", text),
    onStderr: (text) => appendLine("err", text),
  };

  async function ensureMotor() {
    if (motor.status === "ready" || motor.status === "running" || motor.status === "installing")
      return;
    setBooting(true);
    try {
      setMotor({ status: "booting" });
      await getRunner(callbacks);
    } catch (err) {
      setMotor({ status: "error", detail: String(err) });
      toast.error(`Motor Python: ${String(err)}`);
    } finally {
      setBooting(false);
    }
  }

  async function run() {
    if (booting) return;
    await ensureMotor();
    if (motor.status !== "ready") return;
    setImages([]);
    appendLine("info", "── Ejecutando script ──");
    try {
      const api = await getRunner(callbacks);
      const context = includeContext ? await buildQaContext() : null;
      const res = await api.run(code, context, uploaded);
      if (res.ok) {
        appendLine("info", `── Fin de la ejecución (${res.images.length} imagen(es)) ──`);
        setImages(
          res.images.map((img) => ({
            name: img.name,
            url: URL.createObjectURL(new Blob([img.bytes], { type: "image/png" })),
          })),
        );
      } else {
        appendLine("err", `── Error: ${res.error} ──`);
      }
    } catch (err) {
      appendLine("err", String(err));
    }
  }

  const saveMut = useMutation({
    mutationFn: () =>
      saveScript({ id: selectedId || undefined, name: scriptName.trim() || "Sin título", code }),
    onSuccess: (saved) => {
      setSelectedId(saved.id);
      qc.invalidateQueries({ queryKey: ["python-scripts"] });
      toast.success("Script guardado (compartido con el equipo)");
    },
    onError: (e) => toast.error(`No se pudo guardar: ${String(e)}`),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteScript(selectedId),
    onSuccess: () => {
      setSelectedId("");
      qc.invalidateQueries({ queryKey: ["python-scripts"] });
      toast.success("Script eliminado");
    },
    onError: (e) => toast.error(`No se pudo borrar: ${String(e)}`),
  });

  const saveAnalysisMut = useMutation({
    mutationFn: () =>
      saveScript({ name: analysisName.trim() || "Análisis sin título", code, kind: "analysis" }),
    onSuccess: (saved) => {
      setAddAnalysis(false);
      setAnalysisName("");
      qc.invalidateQueries({ queryKey: ["python-analyses"] });
      toast.success(`Análisis "${saved.name}" guardado (compartido con el equipo)`);
    },
    onError: (e) => toast.error(`No se pudo guardar el análisis: ${String(e)}`),
  });

  function loadTemplate(name: string, script: string) {
    if (code !== DEFAULT_SCRIPT && code !== "" && code !== script) {
      if (!window.confirm("Se descartarán los cambios del editor. ¿Continuar?")) return;
    }
    setSelectedId("");
    setScriptName(name);
    setCode(script);
  }

  function selectScript(id: string) {
    if (id === selectedId) return;
    if (code !== DEFAULT_SCRIPT && code !== "") {
      if (!window.confirm("Cambiar de script descartará los cambios del editor. ¿Continuar?"))
        return;
    }
    const s = scripts.data?.find((x) => x.id === id);
    if (!s) return;
    setSelectedId(id);
    setCode(s.code);
    setScriptName(s.name);
  }

  function newScript() {
    if (code !== DEFAULT_SCRIPT && code !== "") {
      if (!window.confirm("Se descartarán los cambios del editor. ¿Continuar?")) return;
    }
    setSelectedId("");
    setScriptName("Sin título");
    setCode("");
  }

  const st = statusLabel(motor.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Terminal className="size-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Python</h1>
          <p className="text-sm text-muted-foreground">
            Ejecuta scripts Python en el navegador (Pyodide + pylinac). Sin instalaciones ni
            servidores.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge
            variant={st.tone === "ok" ? "default" : st.tone === "err" ? "destructive" : "secondary"}
            className="gap-1.5"
          >
            <span
              className={`size-1.5 rounded-full ${st.tone === "ok" ? "bg-green-400" : st.tone === "err" ? "bg-red-400" : "bg-amber-400"}`}
            />
            {st.text}
            {motor.detail && motor.status !== "ready" ? (
              <span className="max-w-[220px] truncate opacity-80">· {motor.detail}</span>
            ) : null}
          </Badge>
          {motor.status !== "ready" && motor.status !== "running" && (
            <Button size="sm" onClick={ensureMotor} disabled={booting}>
              {booting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Iniciar motor
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Análisis LinaQA</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              pylinac 3.38.0 personalizado (picketfence · ct · vmat · winston_lutz)
            </Badge>
            <p className="w-full text-xs text-muted-foreground">
              Pulsa un análisis para cargar su script en el editor, sube los ficheros y ejecuta. Los
              análisis que añadas con «Añadir análisis» también aparecen como botones aquí.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {ANALYSIS_TEMPLATES.map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant="outline"
                onClick={() => loadTemplate(a.label, a.code)}
              >
                {a.label}
              </Button>
            ))}
            {(analyses.data ?? []).map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant="outline"
                onClick={() => loadTemplate(s.name, s.code)}
              >
                {s.name}
              </Button>
            ))}
          </div>
          {addAnalysis ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={analysisName}
                onChange={(e) => setAnalysisName(e.target.value)}
                placeholder="Nombre del análisis"
                className="h-8 max-w-56"
              />
              <Button
                size="sm"
                onClick={() => saveAnalysisMut.mutate()}
                disabled={!analysisName.trim() || saveAnalysisMut.isPending}
              >
                <Save className="size-4" /> Guardar análisis
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddAnalysis(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAddAnalysis(true)}>
              <Plus className="size-4" /> Añadir análisis
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Editor</CardTitle>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Select
                  value={selectedId || "__none__"}
                  onValueChange={(v) => v !== "__none__" && selectScript(v)}
                >
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Scripts guardados" />
                  </SelectTrigger>
                  <SelectContent>
                    {scripts.data?.length ? (
                      scripts.data.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__none__" disabled>
                        Sin scripts guardados
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={newScript}>
                  Nuevo
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Label htmlFor="script-name" className="text-xs text-muted-foreground">
                Nombre
              </Label>
              <Input
                id="script-name"
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                className="h-8 max-w-52 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
              >
                <Save className="size-4" /> Guardar
              </Button>
              {selectedId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() =>
                    window.confirm("¿Eliminar este script para todo el equipo?") &&
                    deleteMut.mutate()
                  }
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="min-h-[420px] flex-1 resize-y rounded-md border bg-background p-3 font-mono text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Código Python"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={run} disabled={booting || motor.status === "running"}>
                {motor.status === "running" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Ejecutar
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={includeContext} onCheckedChange={setIncludeContext} />
                <Database className="size-4" />
                Incluir datos QA (qa_data)
              </label>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  multiple
                  className="hidden"
                  id="py-upload"
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files) return;
                    const arr = await Promise.all(
                      Array.from(files).map(async (f) => ({
                        name: f.name,
                        bytes: await f.arrayBuffer(),
                      })),
                    );
                    setUploaded((prev) => [...prev, ...arr]);
                    appendLine("info", `[ficheros] ${arr.length} subido(s) → /userfiles/`);
                    e.target.value = "";
                  }}
                />
                <Button size="sm" variant="outline" asChild>
                  <label htmlFor="py-upload" className="cursor-pointer">
                    <Upload className="size-4" /> Subir ficheros
                  </label>
                </Button>
                {uploaded.length > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    {uploaded.length} {uploaded.length === 1 ? "fichero" : "ficheros"}
                    <button
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setUploaded([])}
                      aria-label="Limpiar ficheros"
                    >
                      ✕
                    </button>
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Los ficheros subidos quedan en{" "}
              <code className="rounded bg-muted px-1">/userfiles/</code>. Guarda tus figuras en{" "}
              <code className="rounded bg-muted px-1">/out/*.png</code> para verlas aquí. pyplot:{" "}
              <code className="rounded bg-muted px-1">matplotlib.use("Agg")</code>.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center">
                <CardTitle className="text-base">Consola</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-muted-foreground"
                  onClick={() => setConsoleLines([])}
                >
                  <Eraser className="size-4" /> Limpiar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-72 rounded-md border bg-black/90 p-3" ref={consoleRef}>
                <pre className="font-mono text-xs leading-relaxed">
                  {consoleLines.map((l, i) => (
                    <div
                      key={i}
                      className={
                        l.kind === "err"
                          ? "text-red-400"
                          : l.kind === "info"
                            ? "text-sky-400"
                            : "text-green-300"
                      }
                    >
                      {l.text}
                    </div>
                  ))}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Imágenes de /out</CardTitle>
            </CardHeader>
            <CardContent>
              {images.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay imágenes. Guarda PNGs en /out dentro del script.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {images.map((img) => (
                    <div key={img.name} className="overflow-hidden rounded-md border">
                      <img src={img.url} alt={img.name} className="w-full object-contain" />
                      <div className="flex items-center gap-2 border-t bg-muted/40 px-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {img.name}
                        </span>
                        <Button size="sm" variant="ghost" className="size-7 p-0" asChild>
                          <a
                            href={img.url}
                            download={img.name}
                            aria-label={`Descargar ${img.name}`}
                          >
                            <Download className="size-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {motor.status === "error" && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">
            El motor Python no pudo arrancar: {motor.detail}
            <Button
              size="sm"
              variant="outline"
              className="ml-3"
              onClick={() => disposeRunner().then(() => setMotor({ status: "idle" }))}
            >
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

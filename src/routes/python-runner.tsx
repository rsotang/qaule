import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { loadPyodide, type PyodideInterface } from "pyodide";
import type { ParentToRunner, RunnerToParent } from "@/lib/python/types";

export const Route = createFileRoute("/python-runner")({ ssr: false, component: PythonRunner });

const INDEX_URL = "/pyodide/";

const CORE_PACKAGES = [
  "numpy",
  "scipy",
  "scikit-image",
  "matplotlib",
  "Pillow",
  "pydantic",
  "plotly",
  "tqdm",
  "future",
  "six",
  "pyyaml",
  "dnspython",
  "idna",
  "micropip",
];

const LOCAL_WHEELS = [
  "/pyodide/pydicom-2.4.4-py3-none-any.whl",
  "/pyodide/reportlab-5.0.1-py3-none-any.whl",
  "/pyodide/tabulate-0.9.0-py3-none-any.whl",
  "/pyodide/argue-0.3.1-py3-none-any.whl",
  "/pyodide/py_linq-1.4.0-py3-none-any.whl",
  "/pyodide/quaac-1.0.2-py3-none-any.whl",
  "/pyodide/email_validator-2.3.0-py3-none-any.whl",
  "/pyodide/eval_type_backport-0.4.0-py3-none-any.whl",
  "/pyodide/pylinac-3.47.0-py3-none-any.whl",
];

function post(msg: RunnerToParent) {
  // targetOrigin "*": el iframe no conoce de forma fiable el origin del padre
  // (puede ser distinto en desarrollo). El padre valida ev.source, no el origin.
  window.parent.postMessage(msg, "*");
}

function safeBaseName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^A-Za-z0-9._-]/g, "_");
}

function PythonRunner() {
  const pyRef = useRef<PyodideInterface | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        post({ type: "status", status: "booting" });
        const pyodide = await loadPyodide({ indexURL: INDEX_URL });
        if (cancelled) return;
        pyRef.current = pyodide;

        let i = 0;
        for (const p of CORE_PACKAGES) {
          i += 1;
          post({
            type: "status",
            status: "installing",
            detail: `Paquete ${i}/${CORE_PACKAGES.length}: ${p}`,
          });
          await pyodide.loadPackage([p]);
        }

        post({ type: "status", status: "installing", detail: "pylinac y dependencias" });
        pyodide.setStdout({ batched: (s) => post({ type: "stdout", text: s }) });
        pyodide.setStderr({ batched: (s) => post({ type: "stderr", text: s }) });
        await pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(LOCAL_WHEELS)}, deps=False)
`);


        pyodide.FS.mkdirTree("/userfiles");
        pyodide.FS.mkdirTree("/out");
        readyRef.current = true;
        post({
          type: "status",
          status: "ready",
          detail: `crossOriginIsolated=${String(self.crossOriginIsolated)}`,
        });
      } catch (err) {
        post({ type: "status", status: "error", detail: String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRun = useCallback(async (msg: ParentToRunner & { type: "run" }) => {
    const pyodide = pyRef.current;
    if (!pyodide || !readyRef.current) {
      post({ type: "done", ok: false, error: "El motor Python aún no está listo", images: [] });
      return;
    }
    try {
      post({ type: "status", status: "running" });
      try {
        pyodide.FS.rmdirTree("/userfiles");
      } catch {
        // noop
      }
      pyodide.FS.mkdirTree("/userfiles");
      for (const f of msg.files) {
        const name = safeBaseName(f.name);
        pyodide.FS.writeFile(`/userfiles/${name}`, new Uint8Array(f.bytes));
      }
      pyodide.globals.set("qa_data", msg.context ?? null);
      await pyodide.runPythonAsync(msg.code);
      const images = collectImages(pyodide);
      post({ type: "done", ok: true, images });
    } catch (err) {
      post({ type: "done", ok: false, error: String(err), images: [] });
    }
  }, []);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as ParentToRunner | undefined;
      if (!data || typeof data !== "object" || !("type" in data)) return;
      if (data.type === "ping") {
        post({ type: "pong" });
        return;
      }
      if (data.type !== "run") return;
      void handleRun(data);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [handleRun]);

  function collectImages(pyodide: PyodideInterface): { name: string; bytes: ArrayBuffer }[] {
    const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
    const images: { name: string; bytes: ArrayBuffer }[] = [];
    let names: string[] = [];
    try {
      names = pyodide.FS.readdir("/out");
    } catch {
      return images;
    }
    for (const name of names) {
      if (name === "." || name === "..") continue;
      const p = `/out/${name}`;
      let mode = 0;
      try {
        mode = pyodide.FS.stat(p).mode;
      } catch {
        continue;
      }
      if (pyodide.FS.isDir(mode)) continue;
      if (!IMAGE_EXT.test(name)) continue;
      try {
        const bytes = pyodide.FS.readFile(p).buffer as ArrayBuffer;
        images.push({ name, bytes });
      } catch {
        // noop
      }
    }
    return images;
  }

  return null;
}

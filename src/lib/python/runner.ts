import { RUNNER_PATH, type ParentToRunner, type RunnerToParent, type RunnerStatus } from "./types";

export interface RunnerCallbacks {
  onStatus: (status: RunnerStatus, detail?: string) => void;
  onStdout: (text: string) => void;
  onStderr: (text: string) => void;
}

export interface RunnerApi {
  run: (
    code: string,
    context: unknown,
    files: { name: string; bytes: ArrayBuffer }[],
  ) => Promise<{
    ok: boolean;
    error?: string;
    images: { name: string; bytes: ArrayBuffer }[];
  }>;
}

const BOOT_TIMEOUT_MS = 240_000;
const RUN_TIMEOUT_MS = 15 * 60_000;

let bootPromise: Promise<{ iframe: HTMLIFrameElement; api: RunnerApi }> | null = null;

function isFromRunner(ev: MessageEvent, win: Window | null): boolean {
  return win != null && ev.source === win;
}

function waitForMessage<T>(
  win: Window | null,
  eventType: string,
  timeoutMs: number,
  predicate?: (m: RunnerToParent) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error(`Timeout esperando mensaje "${eventType}" del motor Python`));
    }, timeoutMs);
    function onMsg(ev: MessageEvent) {
      if (!isFromRunner(ev, win)) return;
      const data = ev.data as RunnerToParent | undefined;
      if (!data || typeof data !== "object" || !("type" in data)) return;
      if (data.type !== eventType) return;
      if (predicate && !predicate(data)) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      resolve(data as T);
    }
    window.addEventListener("message", onMsg);
  });
}

async function initRunner(
  callbacks: RunnerCallbacks,
): Promise<{ iframe: HTMLIFrameElement; api: RunnerApi }> {
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  // Reenvía TODOS los estados/salidas del iframe durante el arranque para que
  // la UI no se quede congelada en "Arrancando runtime".
  const bootLog = (ev: MessageEvent) => {
    if (!isFromRunner(ev, iframe.contentWindow)) return;
    const data = ev.data as RunnerToParent | undefined;
    if (!data || typeof data !== "object" || !("type" in data)) return;
    if (data.type === "status") callbacks.onStatus(data.status, data.detail);
    else if (data.type === "stdout") callbacks.onStdout(data.text);
    else if (data.type === "stderr") callbacks.onStderr(data.text);
  };
  window.addEventListener("message", bootLog);

  // Un fallo dentro del iframe llega como status "error": conviértelo en rechazo
  // en vez de esperar al timeout completo.
  const failure = new Promise<never>((_, reject) => {
    const onErr = (ev: MessageEvent) => {
      if (!isFromRunner(ev, iframe.contentWindow)) return;
      const data = ev.data as RunnerToParent | undefined;
      if (data && typeof data === "object" && data.type === "status" && data.status === "error") {
        window.removeEventListener("message", onErr);
        reject(new Error(data.detail ?? "Fallo al arrancar el motor Python"));
      }
    };
    window.addEventListener("message", onErr);
  });

  iframe.src = RUNNER_PATH;

  await Promise.race([
    waitForMessage<RunnerToParent>(
      iframe.contentWindow,
      "status",
      BOOT_TIMEOUT_MS,
      (m) => m.type === "status" && m.status === "ready",
    ),
    failure,
  ]).catch((err) => {
    window.removeEventListener("message", bootLog);
    iframe.remove();
    throw err;
  });

  window.removeEventListener("message", bootLog);


  const api: RunnerApi = {
    run(code, context, files) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("El script ha superado el límite de tiempo (15 min)")),
          RUN_TIMEOUT_MS,
        );
        const onMsg = (ev: MessageEvent) => {
          if (!isFromRunner(ev, iframe.contentWindow)) return;
          const data = ev.data as RunnerToParent | undefined;
          if (!data || typeof data !== "object" || !("type" in data)) return;
          if (data.type === "stdout") {
            callbacks.onStdout(data.text);
            return;
          }
          if (data.type === "stderr") {
            callbacks.onStderr(data.text);
            return;
          }
          if (data.type === "status" && data.status === "running") return;
          if (data.type !== "done") return;
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve({ ok: data.ok, error: data.error, images: data.images });
        };
        window.addEventListener("message", onMsg);
        const msg: ParentToRunner = { type: "run", code, context, files };
        iframe.contentWindow?.postMessage(msg, "*");
      });
    },
  };

  return { iframe, api };
}

export async function getRunner(callbacks: RunnerCallbacks): Promise<RunnerApi> {
  if (!bootPromise) {
    bootPromise = initRunner(callbacks).catch((err) => {
      bootPromise = null;
      throw err;
    });
  }
  const { api } = await bootPromise;
  return api;
}

export async function disposeRunner(): Promise<void> {
  if (bootPromise) {
    const { iframe } = await bootPromise.catch(() => ({ iframe: null }));
    iframe?.remove();
    bootPromise = null;
  }
}

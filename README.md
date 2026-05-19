# QA Dashboard — Aceleradores (TB1 / TB2 / TB3)

Dashboard local para el control de calidad mensual de tres aceleradores
lineales de radioterapia. Todos los datos se almacenan en el navegador
(IndexedDB) — no hay servidor, no hay cuentas, no sale nada del equipo.

## Características

- Importación de ficheros `.xlsm` mensuales.
- Plantillas por máquina con **selector visual de celdas**.
- **Auto-detección** de tests a partir de códigos tipo `MLC 10.12`, `CMU 1.1`,
  `CDH 2.3.1`, etc. en cualquier hoja del libro.
- Una sola plantilla puede aplicarse a las 3 máquinas con un clic.
- Gráficos de evolución temporal con bandas de tolerancia.
- Frecuencias mensual / trimestral / anual.
- Backup / restauración en JSON.

## Uso rápido

1. Ve a **Plantillas → TB1 (o TB2/TB3) → Editor**.
2. **Cargar archivo de referencia** (`.xlsm` de marzo, por ejemplo).
3. Pulsa **Auto-detectar tests** — se buscan en todas las hojas las celdas
   cuyo texto contenga un código `XXX N.N` (p.ej. `MLC 10.12`) y se vinculan
   a los valores numéricos adyacentes.
4. Revisa, ajusta tolerancias/unidades y pulsa **Aplicar a TB1/TB2/TB3**.
5. En **Importar**, sube los `.xlsm` mensuales de cada máquina.
6. El **Dashboard** muestra la evolución temporal.

## Despliegue local

Requisitos: [Bun](https://bun.sh) (o Node ≥ 20 con npm).

```bash
bun install
bun run dev          # desarrollo en http://localhost:8080
```

Para una instalación "de uso real" en un PC del servicio sin estar
conectado al sandbox:

```bash
bun install
bun run dev --host   # accesible desde otros equipos de la red local
```

Abre un acceso directo del navegador a `http://<ip-del-pc>:8080`.

### Build de producción (opcional)

El template está preparado para Cloudflare Workers, pero para uso 100 %
local basta con `bun run dev`. Si prefieres servir un build estático, los
datos siguen viviendo en el navegador (IndexedDB) y no necesitas backend.

## Notas

- Los datos están vinculados al navegador concreto. Usa **Exportar backup**
  periódicamente y guarda el JSON en una unidad de red.
- Para mover la base entre PCs, **Importar backup** en el nuevo.
- La plantilla detectada se puede editar test a test desde el editor.

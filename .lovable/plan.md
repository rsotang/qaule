# Revisión de código: errores detectados y correcciones

He revisado tipos, lint, base de datos y errores de ejecución. La compilación de TypeScript pasa sin errores. Estos son los problemas reales encontrados, por orden de gravedad.

## 1. La página Python no puede guardar scripts (crítico)

La tabla `python_scripts` no existe en la base de datos: la migración `20260824000000_python_scripts.sql` está en el proyecto pero nunca se aplicó. Cualquier intento de listar, guardar o borrar un script en `/python` falla.

Corrección:
- Aplicar la migración (crear tabla, RLS y políticas ya definidas).
- Añadir el permiso que falta para el rol de servicio (`grant all ... to service_role`), obligatorio en tablas del esquema público.

## 2. Segundo cliente de base de datos duplicado (alto)

`src/lib/python/scripts.ts` crea su propio cliente en vez de reutilizar el compartido. Consecuencias: aviso en consola de "múltiples instancias de autenticación", riesgo de sesión inconsistente entre pestañas y lectura de variables de entorno en el momento de importar el módulo (fuente del fallo de arranque que ya has visto).

Corrección: usar el cliente generado de la app y tipar la tabla nueva aparte, sin crear un cliente adicional.

## 3. Aviso de hidratación en la pantalla de acceso (medio)

La ruta `/auth` produce un desajuste entre el HTML del servidor y el del navegador. No rompe la app, pero regenera el árbol y provoca un parpadeo.

Corrección: dejar que la pantalla renderice un contenido estable inicial mientras se resuelve la comprobación de sesión.

## 4. Defectos menores de lógica en hooks (bajo)

- `src/routes/_authenticated/index.tsx`: un cálculo memorizado omite `tasks` en sus dependencias, así que el resumen mensual puede mostrar datos obsoletos hasta que algo más fuerce el repintado.
- `src/components/qa/CalendarMapper.tsx`: dependencia inestable en un cálculo memorizado que lo recalcula en cada render.

Corrección: ajustar las dependencias de ambos.

## 5. Limpieza (bajo, sin impacto funcional)

- 12 escapes innecesarios en expresiones regulares (`excel.ts`, `calendar-excel.ts`, `types.ts`).
- 7 variables declaradas como reasignables sin serlo, 2 variables sin usar en `SettingsMenu.tsx`, 1 comentario de lint obsoleto en `db.ts`.
- 827 avisos de formato (Prettier) en varios ficheros; se corrigen automáticamente.

## Notas técnicas

- Migración: nueva migración idempotente que crea `python_scripts` con RLS y los `GRANT` completos (`authenticated` + `service_role`); tras aplicarla se regeneran los tipos y se elimina el tipo `ExtendedDatabase` improvisado.
- `scripts.ts` pasa a importar `supabase` de `@/integrations/supabase/client`.
- No se toca la lógica de importación, plantillas ni visualización.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listMachineKinds, listCategories } from "@/lib/qa/db";
import {
  BUILTIN_KINDS,
  BUILTIN_CATEGORIES,
  type MachineKindDef,
  type CategoryDef,
  type MachineKind,
  type Category,
  categoriesForKind,
} from "@/lib/qa/types";

/** Fusiona el catálogo de la BD con el de fábrica: las categorías/tipos builtin siempre están presentes. */
function mergeKinds(db: MachineKindDef[]): MachineKindDef[] {
  const out = [...db];
  for (const b of BUILTIN_KINDS) {
    if (!out.some((k) => k.id === b.id)) out.push(b);
  }
  return out;
}

function mergeCategories(db: CategoryDef[]): CategoryDef[] {
  const out = [...db];
  for (const b of BUILTIN_CATEGORIES) {
    if (!out.some((c) => c.id === b.id)) out.push(b);
  }
  return out;
}

/** Tipos de máquina y catálogo de categorías (BD con fallback al catálogo de fábrica). */
export function useMachineCatalog() {
  const kindsQuery = useQuery({ queryKey: ["machine-kinds"], queryFn: listMachineKinds });
  const catsQuery = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const kinds: MachineKindDef[] = useMemo(
    () => mergeKinds(kindsQuery.data ?? []),
    [kindsQuery.data],
  );
  const categories: CategoryDef[] = useMemo(
    () => mergeCategories(catsQuery.data ?? []),
    [catsQuery.data],
  );

  return {
    kinds,
    categories,
    isLoading: kindsQuery.isLoading || catsQuery.isLoading,
    isError: kindsQuery.isError || catsQuery.isError,
    error: (kindsQuery.error ?? catsQuery.error) as Error | null,
    kindById: (id: MachineKind | undefined) => kinds.find((k) => k.id === id),
    categoriesFor: (kind: MachineKind | undefined): Category[] =>
      categoriesForKind(kind, kinds, categories),
    categoryName: (id: string | undefined) =>
      categories.find((c) => c.id === id)?.name ?? id ?? "—",
    kindName: (id: MachineKind | undefined) => kinds.find((k) => k.id === id)?.name ?? id ?? "—",
  };
}

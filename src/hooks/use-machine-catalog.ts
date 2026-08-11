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

/** Tipos de máquina y catálogo de categorías (BD con fallback al catálogo de fábrica). */
export function useMachineCatalog() {
  const kindsQuery = useQuery({ queryKey: ["machine-kinds"], queryFn: listMachineKinds });
  const catsQuery = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const kinds: MachineKindDef[] = useMemo(
    () => kindsQuery.data ?? BUILTIN_KINDS,
    [kindsQuery.data],
  );
  const categories: CategoryDef[] = useMemo(
    () => catsQuery.data ?? BUILTIN_CATEGORIES,
    [catsQuery.data],
  );

  return {
    kinds,
    categories,
    isLoading: kindsQuery.isLoading || catsQuery.isLoading,
    kindById: (id: MachineKind | undefined) => kinds.find((k) => k.id === id),
    categoriesFor: (kind: MachineKind | undefined): Category[] =>
      categoriesForKind(kind, kinds, categories),
    categoryName: (id: string | undefined) =>
      categories.find((c) => c.id === id)?.name ?? id ?? "—",
    kindName: (id: MachineKind | undefined) => kinds.find((k) => k.id === id)?.name ?? id ?? "—",
  };
}

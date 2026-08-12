import { useQuery } from "@tanstack/react-query";
import { listMachines } from "@/lib/qa/db";
import { mergeMachineList } from "@/lib/qa/types";
import { useMemo } from "react";

/** Seeded machines plus user-created ones, kept in sync with the database. */
export function useMachineList() {
  const machines = useQuery({
    queryKey: ["machines"],
    queryFn: listMachines,
    staleTime: 60_000,
  });
  if (machines.isError) console.error("useMachineList: failed to load machines", machines.error);
  return useMemo(() => mergeMachineList(machines.data ?? []), [machines.data]);
}

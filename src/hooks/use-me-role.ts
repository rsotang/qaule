import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { meRole, type MeRole } from "@/lib/admin.functions";

/** Rol efectivo del usuario actual: "admin" | "user" | "viewer" (demo solo lectura). */
export function useMeRole() {
  const meFn = useServerFn(meRole);
  const q = useQuery({
    queryKey: ["me-role"],
    queryFn: () => meFn(),
  });
  return {
    role: (q.data?.role ?? "user") as MeRole,
    isAdmin: q.data?.role === "admin",
    isViewer: q.data?.role === "viewer",
    isLoading: q.isLoading,
  };
}

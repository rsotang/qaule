import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { meIsAdmin } from "@/lib/admin.functions";

/** True when the signed-in user has the admin role. */
export function useIsAdmin(): boolean {
  const meFn = useServerFn(meIsAdmin);
  const me = useQuery({ queryKey: ["me-admin"], queryFn: () => meFn() });
  return me.data?.isAdmin === true;
}

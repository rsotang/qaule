import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { meIsAdmin } from "@/lib/admin.functions";

/** True when the signed-in user has the admin role. Exposes loading/error for callers that need granular control. */
export function useIsAdmin() {
  const meFn = useServerFn(meIsAdmin);
  const me = useQuery({
    queryKey: ["me-admin"],
    queryFn: () => meFn(),
    staleTime: 60_000,
    retry: 1,
  });
  return {
    isAdmin: me.data?.isAdmin === true,
    isLoading: me.isLoading,
    isError: me.isError,
    error: me.error as Error | null,
  };
}

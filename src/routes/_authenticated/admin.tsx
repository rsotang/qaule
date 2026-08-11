import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Settings2 } from "lucide-react";
import { meIsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminLayout });

function AdminLayout() {
  const meFn = useServerFn(meIsAdmin);
  const me = useQuery({ queryKey: ["me-admin"], queryFn: () => meFn() });
  const { pathname } = useLocation();

  if (me.isLoading) return <p className="p-8 text-sm text-muted-foreground">Cargando…</p>;
  if (!me.data?.isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acceso restringido</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Solo los administradores pueden acceder a esta sección.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tabs = [
    { to: "/admin", label: "Usuarios", icon: Users },
    { to: "/admin/machines", label: "Máquinas", icon: Settings2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => {
          const active = pathname === t.to || (t.to !== "/admin" && pathname.startsWith(t.to));
          return (
            <Button key={t.to} asChild variant={active ? "default" : "outline"} size="sm">
              <Link to={t.to}>
                <t.icon className="size-4" /> {t.label}
              </Link>
            </Button>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}

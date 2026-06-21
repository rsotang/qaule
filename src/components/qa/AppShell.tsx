import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Upload, Settings2, LineChart, LogOut, Users } from "lucide-react";
import { SettingsMenu } from "./SettingsMenu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { meIsAdmin } from "@/lib/admin.functions";
import { toast } from "sonner";

export function AppShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const meFn = useServerFn(meIsAdmin);
  const me = useQuery({ queryKey: ["me-admin"], queryFn: () => meFn() });

  const user = useQuery({
    queryKey: ["me-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="flex w-full items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-1.5 font-semibold tracking-tight">
            <Activity className="size-6 text-primary" />
            <span className="leading-none">
              <span className="text-2xl font-bold tracking-tight text-primary">QA</span>
              <span className="text-base font-semibold tracking-wide text-foreground/80">ULE</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink to="/" icon={<Activity className="size-4" />} label="Dashboard" />
            <NavLink to="/visualization" icon={<LineChart className="size-4" />} label="Visualización" />
            <NavLink to="/imports" icon={<Upload className="size-4" />} label="Importaciones" />
            <NavLink to="/templates" icon={<Settings2 className="size-4" />} label="Plantillas" />
            {me.data?.isAdmin && (
              <NavLink to="/admin" icon={<Users className="size-4" />} label="Usuarios" />
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user.data?.email && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {user.data.email}
              </span>
            )}
            <SettingsMenu />
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Cerrar sesión">
              <LogOut className="size-5" />
            </Button>
          </div>
        </div>
      </header>
      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      activeOptions={{ exact: to === "/" }}
      activeProps={{ className: "bg-accent text-foreground" }}
    >
      {icon}
      {label}
    </Link>
  );
}

import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Activity, Upload, Settings2, LineChart, LogOut, Users, Menu } from "lucide-react";
import { SettingsMenu } from "./SettingsMenu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { meIsAdmin } from "@/lib/admin.functions";
import { toast } from "sonner";

export function AppShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const meFn = useServerFn(meIsAdmin);
  const me = useQuery({ queryKey: ["me-admin"], queryFn: () => meFn() });
  const [open, setOpen] = useState(false);

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

  const links = (
    <>
      <NavLink to="/" icon={<Activity className="size-4" />} label="Dashboard" />
      <NavLink to="/visualization" icon={<LineChart className="size-4" />} label="Visualización" />
      <NavLink to="/imports" icon={<Upload className="size-4" />} label="Importaciones" />
      <NavLink to="/templates" icon={<Settings2 className="size-4" />} label="Plantillas" />
      {me.data?.isAdmin && <NavLink to="/admin" icon={<Users className="size-4" />} label="Usuarios" />}
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="flex w-full items-center gap-3 px-3 py-3 sm:gap-6 sm:px-6 lg:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle className="text-left">
                  <span className="text-2xl font-bold tracking-tight text-primary">QA</span>
                  <span className="text-base font-semibold tracking-wide text-foreground/80">ULE</span>
                </SheetTitle>
              </SheetHeader>
              <nav
                className="flex flex-col gap-1 p-3 text-sm"
                onClick={() => setOpen(false)}
              >
                {links}
              </nav>
              {user.data?.email && (
                <p className="truncate px-4 pt-2 text-xs text-muted-foreground">{user.data.email}</p>
              )}
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex min-w-0 items-center gap-1.5 font-semibold tracking-tight">
            <Activity className="size-6 shrink-0 text-primary" />
            <span className="leading-none">
              <span className="text-2xl font-bold tracking-tight text-primary">QA</span>
              <span className="text-base font-semibold tracking-wide text-foreground/80">ULE</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 text-sm md:flex">{links}</nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            {user.data?.email && (
              <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground lg:inline">
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
      <main className="w-full px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:py-1.5"
      activeOptions={{ exact: to === "/" }}
      activeProps={{ className: "bg-accent text-foreground" }}
    >
      {icon}
      {label}
    </Link>
  );
}


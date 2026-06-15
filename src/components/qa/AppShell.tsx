import { Link, Outlet } from "@tanstack/react-router";
import { Activity, Upload, Settings2, LineChart } from "lucide-react";
import { SettingsMenu } from "./SettingsMenu";

export function AppShell() {
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
          </nav>
          <div className="ml-auto">
            <SettingsMenu />
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

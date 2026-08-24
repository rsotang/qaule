import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import trebolAsset from "@/assets/trebol_radiacion.svg.asset.json";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);

  useEffect(() => {
    // If already signed in, go home.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
    // Detect whether any user exists. If none → show bootstrap admin form.
    supabase.rpc("public_has_any_user").then(({ data, error }) => {
      if (error) {
        setNeedsBootstrap(false);
      } else {
        setNeedsBootstrap(!data);
      }
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/" });
  }

  async function handleBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName || email.split("@")[0] },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Auto sign-in (auto_confirm_email is on)
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      toast.success("Cuenta creada. Inicia sesión.");
      setNeedsBootstrap(false);
      return;
    }
    toast.success("Administrador creado");
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <img src={trebolAsset.url} alt="QAULE" className="h-8 w-auto" />
            <span className="leading-none">
              <span className="text-3xl font-bold tracking-tight text-primary">QA</span>
              <span className="text-lg font-semibold tracking-wide text-foreground/80">ULE</span>
            </span>
          </div>
          <CardTitle className="text-base font-medium text-muted-foreground">
            {needsBootstrap ? "Crear administrador inicial" : "Iniciar sesión"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {needsBootstrap === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : needsBootstrap ? (
            <form className="space-y-4" onSubmit={handleBootstrap}>
              <div className="space-y-1.5">
                <Label htmlFor="dn">Nombre</Label>
                <Input
                  id="dn"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="em">Email</Label>
                <Input
                  id="em"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw">Contraseña</Label>
                <Input
                  id="pw"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creando…" : "Crear administrador y entrar"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Esta opción solo aparece la primera vez. Las cuentas posteriores las crea el
                administrador.
              </p>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSignIn}>
              <div className="space-y-1.5">
                <Label htmlFor="em-login">Email</Label>
                <Input
                  id="em-login"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-login">Contraseña</Label>
                <Input
                  id="pw-login"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Entrando…" : "Entrar"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                ¿No tienes cuenta? Pide a un administrador que te dé acceso.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

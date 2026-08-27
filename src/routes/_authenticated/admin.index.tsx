import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, UserPlus, EyeOff, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listUsers,
  createUser,
  deleteUser,
  setUserRole,
  setViewerRole,
  meIsAdmin,
} from "@/lib/admin.functions";
import { useMeRole } from "@/hooks/use-me-role";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminPage });

function AdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const createFn = useServerFn(createUser);
  const deleteFn = useServerFn(deleteUser);
  const setRoleFn = useServerFn(setUserRole);
  const setViewerFn = useServerFn(setViewerRole);
  const meFn = useServerFn(meIsAdmin);
  const { isViewer } = useMeRole();

  const me = useQuery({ queryKey: ["me-admin"], queryFn: () => meFn() });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    enabled: me.data?.isAdmin === true || isViewer,
  });

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [makeViewer, setMakeViewer] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: { email, password, displayName, admin: makeAdmin, viewer: makeViewer },
      }),
    onSuccess: () => {
      toast.success("Usuario creado");
      setEmail("");
      setDisplayName("");
      setPassword("");
      setMakeAdmin(false);
      setMakeViewer(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuario eliminado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAdmin = useMutation({
    mutationFn: (p: { userId: string; admin: boolean }) => setRoleFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleViewer = useMutation({
    mutationFn: (p: { userId: string; viewer: boolean }) => setViewerFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (me.isLoading) return <p className="p-8 text-sm text-muted-foreground">Cargando…</p>;
  if (!me.data?.isAdmin && !isViewer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acceso restringido</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Solo los administradores pueden gestionar usuarios.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Crea cuentas para el personal. Todos comparten los mismos datos.
        </p>
      </div>

      {!isViewer && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="size-4" /> Añadir usuario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
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
                <Label htmlFor="dn">Nombre</Label>
                <Input
                  id="dn"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw">Contraseña temporal</Label>
                <Input
                  id="pw"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="ad"
                    checked={makeAdmin}
                    onCheckedChange={(v) => {
                      setMakeAdmin(v);
                      if (v) setMakeViewer(false);
                    }}
                  />
                  <Label htmlFor="ad" className="text-sm">
                    Administrador
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="dv"
                    checked={makeViewer}
                    onCheckedChange={(v) => {
                      setMakeViewer(v);
                      if (v) setMakeAdmin(false);
                    }}
                  />
                  <Label htmlFor="dv" className="text-sm">
                    Demo (solo lectura)
                  </Label>
                </div>
                <Button type="submit" disabled={create.isPending} className="ml-auto">
                  {create.isPending ? "Creando…" : "Crear"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cuentas existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {users.isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data?.map((u) => {
                  const isAdmin = u.roles.includes("admin");
                  const isDemo = u.roles.includes("viewer");
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell className="text-sm">{u.displayName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {isDemo ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/15 text-amber-700"
                            >
                              <EyeOff className="size-3" /> Demo
                            </Badge>
                          ) : isAdmin ? (
                            <Badge>Admin</Badge>
                          ) : (
                            <Badge variant="outline">
                              <UserRound className="size-3" /> User
                            </Badge>
                          )}
                          {!isViewer && (
                            <Switch
                              checked={isAdmin}
                              onCheckedChange={async (v) => {
                                if (!v) {
                                  const { data: authData } = await supabase.auth.getUser();
                                  if (authData.user?.id === u.id) {
                                    toast.error(
                                      "No puedes quitarte a ti mismo el rol de administrador",
                                    );
                                    return;
                                  }
                                }
                                toggleAdmin.mutate({ userId: u.id, admin: v });
                              }}
                              aria-label="Alternar administrador"
                            />
                          )}
                          {!isViewer && !isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => toggleViewer.mutate({ userId: u.id, viewer: !isDemo })}
                              title={
                                isDemo
                                  ? "Convertir en usuario normal"
                                  : "Convertir en demo (solo lectura)"
                              }
                            >
                              {isDemo ? "Quitar demo" : "Hacer demo"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isViewer}
                          onClick={() => {
                            if (confirm(`¿Eliminar a ${u.email}?`)) remove.mutate(u.id);
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

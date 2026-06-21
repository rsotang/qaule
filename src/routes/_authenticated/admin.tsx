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
import { Trash2, UserPlus } from "lucide-react";
import { listUsers, createUser, deleteUser, setUserRole, meIsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminPage });

function AdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const createFn = useServerFn(createUser);
  const deleteFn = useServerFn(deleteUser);
  const setRoleFn = useServerFn(setUserRole);
  const meFn = useServerFn(meIsAdmin);

  const me = useQuery({ queryKey: ["me-admin"], queryFn: () => meFn() });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    enabled: me.data?.isAdmin === true,
  });

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      createFn({ data: { email, password, displayName, admin: makeAdmin } }),
    onSuccess: () => {
      toast.success("Usuario creado");
      setEmail("");
      setDisplayName("");
      setPassword("");
      setMakeAdmin(false);
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

  if (me.isLoading) return <p className="p-8 text-sm text-muted-foreground">Cargando…</p>;
  if (!me.data?.isAdmin) {
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
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Crea cuentas para el personal. Todos comparten los mismos datos.
        </p>
      </div>

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
              <Input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dn">Nombre</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">Contraseña temporal</Label>
              <Input id="pw" type="text" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch id="ad" checked={makeAdmin} onCheckedChange={setMakeAdmin} />
                <Label htmlFor="ad" className="text-sm">Administrador</Label>
              </div>
              <Button type="submit" disabled={create.isPending} className="ml-auto">
                {create.isPending ? "Creando…" : "Crear"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell className="text-sm">{u.displayName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isAdmin ? <Badge>Admin</Badge> : <Badge variant="outline">User</Badge>}
                          <Switch
                            checked={isAdmin}
                            onCheckedChange={(v) =>
                              toggleAdmin.mutate({ userId: u.id, admin: v })
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
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

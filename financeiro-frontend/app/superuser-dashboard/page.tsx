"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  api, createTenant, listMasterUsers, resetUserPassword, updateUserStatus,
  updateTenantStatus, renameTenant, deleteTenant, impersonateUser, criarUsuario,
} from "@/lib/api";
import { Usuario } from "@/lib/types";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign, Users, CheckCircle, XCircle, Plus, LogOut,
  KeyRound, Ban, Trash2, Pencil, UserPlus, Eye,
} from "lucide-react"; // Ícones para os cards e ações
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'; // Para gráficos

// Definição das interfaces para os dados (deve refletir o schemas.py do backend)
interface TenantStats {
  id: number;
  nome: string;
  is_active: boolean;
  data_criacao: string; // Ou Date, dependendo de como você parseia
  total_usuarios: number;
  total_transacoes: number;
}

interface MasterStats {
  total_tenants: number;
  tenants_ativos: number;
  tenants_suspensos: number;
  total_usuarios: number;
  volume_financeiro_global: number;
  crescimento_tenants_mensal: { [key: string]: number };
  ranking_tenants_ativos: TenantStats[];
  tamanho_db_mb: number;
}

interface Denominacao {
  id: number;
  nome: string;
  is_active: boolean;
}

// Funções que o superuser pode atribuir a um usuário de tenant.
const FUNCOES = [
  { value: "administrador", label: "Administrador" },
  { value: "supervisor_denominacao", label: "Supervisor de Denominação" },
  { value: "supervisor_area", label: "Supervisor de Área" },
  { value: "tesoureiro", label: "Tesoureiro" },
];

const emptyUserForm = { email: "", password: "", funcao: "administrador" };

export default function SuperuserDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth(); // Assume que useAuth fornece o usuário logado
  const [stats, setStats] = useState<MasterStats | null>(null);
  const [tenants, setTenants] = useState<Denominacao[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [tenantForm, setTenantForm] = useState({ nome_denominacao: "", admin_email: "", admin_password: "" });
  const [creatingTenant, setCreatingTenant] = useState(false);

  // --- Estado do painel de usuários de um tenant ---
  const [userPanelTenant, setUserPanelTenant] = useState<Denominacao | null>(null);
  const [tenantUsers, setTenantUsers] = useState<Usuario[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUser, setNewUser] = useState(emptyUserForm);
  const [creatingUser, setCreatingUser] = useState(false);

  // --- Estado dos modais de ação ---
  const [renameTarget, setRenameTarget] = useState<Denominacao | null>(null);
  const [renameName, setRenameName] = useState("");
  const [resetTarget, setResetTarget] = useState<Usuario | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  // Carrega as estatísticas e a lista de denominações.
  // `silent` evita o toast de erro (usado após a criação, que já tem seu próprio feedback).
  const refreshData = async (silent = false) => {
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        api.get<MasterStats>("/master/stats"),
        api.get<Denominacao[]>("/master/tenants"),
      ]);
      setStats(statsRes.data);
      setTenants(tenantsRes.data);
    } catch (error) {
      console.error("Erro ao carregar dados do Painel Master:", error);
      if (!silent) {
        toast.error("Erro ao carregar as estatísticas do sistema.");
      }
    } finally {
      setLoadingStats(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTenant(true);
    try {
      await createTenant(tenantForm);
      toast.success(`Denominação "${tenantForm.nome_denominacao}" criada com sucesso!`);
      setTenantForm({ nome_denominacao: "", admin_email: "", admin_password: "" });
    } catch (error) {
      console.error("Erro ao criar denominação:", error);
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Erro ao criar a denominação.");
      setCreatingTenant(false);
      return;
    }
    // Atualiza o painel (KPIs + lista) sem acionar o toast de erro de criação.
    await refreshData(true);
    setCreatingTenant(false);
  };

  // --- Ações de tenant ---
  const handleToggleTenantStatus = async (tenant: Denominacao) => {
    try {
      await updateTenantStatus(tenant.id, { is_active: !tenant.is_active });
      toast.success(tenant.is_active ? `Denominação "${tenant.nome}" suspensa.` : `Denominação "${tenant.nome}" ativada.`);
      await refreshData(true);
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Erro ao alterar o status da denominação.");
    }
  };

  const openRename = (tenant: Denominacao) => {
    setRenameTarget(tenant);
    setRenameName(tenant.nome);
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameName.trim()) return;
    try {
      await renameTenant(renameTarget.id, { nome: renameName.trim() });
      toast.success("Denominação renomeada.");
      setRenameTarget(null);
      await refreshData(true);
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Erro ao renomear a denominação.");
    }
  };

  const handleDeleteTenant = async (tenant: Denominacao) => {
    if (!confirm(`Excluir a denominação "${tenant.nome}" e TODOS os seus dados (usuários, meses, lançamentos)? Esta ação é irreversível.`)) return;
    try {
      await deleteTenant(tenant.id);
      toast.success(`Denominação "${tenant.nome}" excluída.`);
      await refreshData(true);
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Erro ao excluir a denominação.");
    }
  };

  // --- Ações do painel de usuários ---
  const loadTenantUsers = async (tenantId: number) => {
    setLoadingUsers(true);
    try {
      const users = await listMasterUsers(tenantId);
      setTenantUsers(users);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
      toast.error("Erro ao carregar os usuários da denominação.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const openUserPanel = (tenant: Denominacao) => {
    setUserPanelTenant(tenant);
    setNewUser(emptyUserForm);
    loadTenantUsers(tenant.id);
  };

  const closeUserPanel = () => {
    setUserPanelTenant(null);
    setTenantUsers([]);
    setNewUser(emptyUserForm);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPanelTenant || !newUser.email.trim() || !newUser.password) return;
    setCreatingUser(true);
    try {
      await criarUsuario({
        email: newUser.email.trim(),
        password: newUser.password,
        funcao: newUser.funcao,
        denominacao_id: userPanelTenant.id,
      });
      toast.success(`Usuário "${newUser.email}" criado.`);
      setNewUser(emptyUserForm);
      await loadTenantUsers(userPanelTenant.id);
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Erro ao criar o usuário.");
    } finally {
      setCreatingUser(false);
    }
  };

  const openReset = (u: Usuario) => {
    setResetTarget(u);
    setResetPassword("");
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !resetPassword) return;
    try {
      await resetUserPassword(resetTarget.id, { nova_senha: resetPassword });
      toast.success(`Senha de "${resetTarget.email}" redefinida.`);
      setResetTarget(null);
      if (userPanelTenant) await loadTenantUsers(userPanelTenant.id);
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Erro ao redefinir a senha.");
    }
  };

  const handleToggleUserStatus = async (u: Usuario) => {
    try {
      await updateUserStatus(u.id, { is_active: !(u.is_active ?? true) });
      toast.success(u.is_active ? `Usuário "${u.email}" suspenso.` : `Usuário "${u.email}" reativado.`);
      if (userPanelTenant) await loadTenantUsers(userPanelTenant.id);
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Erro ao alterar o status do usuário.");
    }
  };

  const handleImpersonate = async (u: Usuario) => {
    try {
      const { access_token } = await impersonateUser(u.id);
      // Guarda o token do superuser para permitir voltar ao modo superuser depois.
      const currentToken = localStorage.getItem("access_token");
      if (currentToken) localStorage.setItem("superuser_token", currentToken);
      localStorage.setItem("access_token", access_token);
      api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
      toast.success(`Personificando ${u.email}`);
      router.push("/dashboard");
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Erro ao personificar o usuário.");
    }
  };

  useEffect(() => {
    // Redireciona se não for superusuário
    if (!authLoading && (!user || !user.is_superuser)) {
      toast.error("Acesso negado. Apenas superusuários podem acessar este painel.");
      router.push("/"); // Redireciona para a página de login
      return;
    }

    if (user && user.is_superuser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch: setState só roda após o await
      refreshData();
    }
  }, [user, authLoading, router]);

  if (authLoading || loadingStats) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-slate-950">
        <p className="text-white">Carregando Painel Master...</p>
      </main>
    );
  }

  if (!user || !user.is_superuser) {
    return null; // Não deve acontecer, pois já redirecionamos
  }

  // Prepara os dados para o gráfico de crescimento mensal
  const growthData = stats?.crescimento_tenants_mensal ?
    Object.entries(stats.crescimento_tenants_mensal)
      .map(([month, count]) => ({ mes: month, novosTenants: count }))
      .sort((a, b) => a.mes.localeCompare(b.mes)) // Ordena por mês
    : [];

  return (
    <div className="min-h-screen p-8 bg-slate-950 text-white">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-emerald-400">Painel Master</h1>
        <Button onClick={logout} variant="outline" className="border-slate-700 hover:bg-slate-800 hover:text-white">
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>

      {/* Seção de KPIs Principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="bg-slate-900 border-slate-800 text-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Denominações</CardTitle>
            <Users className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_tenants}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 text-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tenants Ativos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.tenants_ativos}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 text-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tenants Suspensos</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.tenants_suspensos}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 text-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume Financeiro Global</CardTitle>
            <DollarSign className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.volume_financeiro_global?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Criar Nova Denominação (Tenant) */}
      <Card className="mb-8 bg-slate-900 border-slate-800 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-400" />
            Criar Nova Denominação (Tenant)
          </CardTitle>
          <CardDescription>
            Cadastre uma nova denominação e o administrador dela. O administrador pertence ao tenant e não tem privilégios de superuser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTenant} className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="tenant_nome">Nome da Denominação</Label>
              <Input
                id="tenant_nome"
                type="text"
                placeholder="Ex: Assembleias de Deus"
                autoComplete="off"
                required
                value={tenantForm.nome_denominacao}
                onChange={(e) => setTenantForm(prev => ({ ...prev, nome_denominacao: e.target.value }))}
                className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tenant_admin_email">E-mail do Administrador</Label>
              <Input
                id="tenant_admin_email"
                type="email"
                placeholder="admin@denominacao.com"
                autoComplete="off"
                required
                value={tenantForm.admin_email}
                onChange={(e) => setTenantForm(prev => ({ ...prev, admin_email: e.target.value }))}
                className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tenant_admin_password">Senha do Administrador</Label>
              <Input
                id="tenant_admin_password"
                type="password"
                placeholder="Senha do administrador"
                autoComplete="new-password"
                required
                value={tenantForm.admin_password}
                onChange={(e) => setTenantForm(prev => ({ ...prev, admin_password: e.target.value }))}
                className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500" disabled={creatingTenant}>
                {creatingTenant ? "Criando..." : "Criar Denominação"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Lista de Denominações Criadas + ações */}
      <Card className="mb-8 bg-slate-900 border-slate-800 text-white">
        <CardHeader>
          <CardTitle>Denominações Criadas</CardTitle>
          <CardDescription>Todas as denominações cadastradas na plataforma e as ações disponíveis.</CardDescription>
        </CardHeader>
        <CardContent>
          {tenants && tenants.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left table-auto">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-2 px-4">Nome</th>
                    <th className="py-2 px-4">Status</th>
                    <th className="py-2 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-b border-slate-800 last:border-b-0">
                      <td className="py-2 px-4">{tenant.nome}</td>
                      <td className="py-2 px-4">
                        {tenant.is_active ? (
                          <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Ativa</Badge>
                        ) : (
                          <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Suspensa</Badge>
                        )}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-700 hover:bg-slate-800"
                            onClick={() => openUserPanel(tenant)}
                          >
                            <Users className="h-4 w-4 mr-1" />
                            Usuários
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-700 hover:bg-slate-800"
                            onClick={() => openRename(tenant)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Renomear
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={tenant.is_active
                              ? "border-amber-600/50 text-amber-400 hover:bg-amber-950/40"
                              : "border-green-600/50 text-green-400 hover:bg-green-950/40"}
                            onClick={() => handleToggleTenantStatus(tenant)}
                          >
                            {tenant.is_active ? <><Ban className="h-4 w-4 mr-1" />Suspender</> : <><CheckCircle className="h-4 w-4 mr-1" />Ativar</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-700/50 text-red-400 hover:bg-red-950/40"
                            onClick={() => handleDeleteTenant(tenant)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400">Nenhuma denominação criada ainda.</p>
          )}
        </CardContent>
      </Card>

      {/* Gráfico de Crescimento de Tenants */}
      <Card className="mb-8 bg-slate-900 border-slate-800 text-white">
        <CardHeader>
          <CardTitle>Crescimento de Novos Tenants por Mês</CardTitle>
          <CardDescription>Novas denominações cadastradas ao longo do tempo.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" /> {/* slate-600 */}
              <XAxis dataKey="mes" stroke="#cbd5e1" /> {/* slate-300 */}
              <YAxis stroke="#cbd5e1" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value) => `${value} tenants`}
              />
              <Bar dataKey="novosTenants" fill="#10b981" /> {/* emerald-500 */}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Ranking de Tenants Ativos */}
      <Card className="mb-8 bg-slate-900 border-slate-800 text-white">
        <CardHeader>
          <CardTitle>Top 5 Denominações Mais Ativas</CardTitle>
          <CardDescription>Baseado no total de transações (rendas + despesas).</CardDescription>
        </CardHeader>
        <CardContent>
          {stats?.ranking_tenants_ativos && stats.ranking_tenants_ativos.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left table-auto">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-2 px-4">Nome</th>
                    <th className="py-2 px-4">Status</th>
                    <th className="py-2 px-4">Usuários</th>
                    <th className="py-2 px-4">Transações</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.ranking_tenants_ativos.map((tenant) => (
                    <tr key={tenant.id} className="border-b border-slate-800 last:border-b-0">
                      <td className="py-2 px-4">{tenant.nome}</td>
                      <td className="py-2 px-4">
                        {tenant.is_active ? (
                          <span className="text-green-500">Ativo</span>
                        ) : (
                          <span className="text-red-500">Suspenso</span>
                        )}
                      </td>
                      <td className="py-2 px-4">{tenant.total_usuarios}</td>
                      <td className="py-2 px-4">{tenant.total_transacoes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400">Nenhum tenant ativo encontrado.</p>
          )}
        </CardContent>
      </Card>

      {/* Outras informações */}
      <Card className="bg-slate-900 border-slate-800 text-white">
        <CardHeader>
          <CardTitle>Informações do Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">Tamanho do Banco de Dados: {stats?.tamanho_db_mb} MB</p>
          <p className="text-sm">Total de Usuários na Plataforma: {stats?.total_usuarios}</p>
        </CardContent>
      </Card>

      {/* Modal: Renomear Denominação */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) setRenameTarget(null); }}>
        <DialogContent className="bg-slate-900 text-white border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-emerald-400" />
              Renomear Denominação
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              Altere o nome exibido da denominação.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rename_name">Novo Nome</Label>
              <Input
                id="rename_name"
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                required
              />
            </div>
            <DialogFooter className="border-slate-800 bg-slate-950/50">
              <Button type="button" variant="outline" className="border-slate-700 hover:bg-slate-800" onClick={() => setRenameTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Redefinir Senha */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
        <DialogContent className="bg-slate-900 text-white border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-400" />
              Redefinir Senha
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              Defina uma nova senha para <span className="text-white">{resetTarget?.email}</span>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="reset_password">Nova Senha</Label>
              <Input
                id="reset_password"
                type="password"
                placeholder="Nova senha"
                autoComplete="new-password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                required
              />
            </div>
            <DialogFooter className="border-slate-800 bg-slate-950/50">
              <Button type="button" variant="outline" className="border-slate-700 hover:bg-slate-800" onClick={() => setResetTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500">Redefinir</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Usuários da Denominação */}
      <Dialog open={!!userPanelTenant} onOpenChange={(open) => { if (!open) closeUserPanel(); }}>
        <DialogContent className="bg-slate-900 text-white border-slate-800 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-400" />
              Usuários de {userPanelTenant?.nome}
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              Gerencie os usuários desta denominação: crie, redefina senhas, suspenda ou personifique.
            </DialogDescription>
          </DialogHeader>

          {/* Formulário de novo usuário */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-emerald-400" />
              Novo Usuário
            </p>
            <form onSubmit={handleCreateUser} className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="new_user_email" className="text-slate-300 text-xs">E-mail</Label>
                <Input
                  id="new_user_email"
                  type="email"
                  placeholder="usuario@denominacao.com"
                  autoComplete="off"
                  value={newUser.email}
                  onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new_user_password" className="text-slate-300 text-xs">Senha</Label>
                <Input
                  id="new_user_password"
                  type="password"
                  placeholder="Senha inicial"
                  autoComplete="new-password"
                  value={newUser.password}
                  onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                  className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new_user_funcao" className="text-slate-300 text-xs">Função</Label>
                <select
                  id="new_user_funcao"
                  value={newUser.funcao}
                  onChange={(e) => setNewUser(prev => ({ ...prev, funcao: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm focus:ring-emerald-500 focus:outline-none"
                >
                  {FUNCOES.map(f => (
                    <option key={f.value} value={f.value} className="bg-slate-800">{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 w-full" disabled={creatingUser}>
                  {creatingUser ? "Criando..." : "Criar Usuário"}
                </Button>
              </div>
            </form>
          </div>

          {/* Lista de usuários */}
          <div className="mt-4">
            <p className="text-sm font-medium mb-2">Usuários cadastrados ({tenantUsers.length})</p>
            {loadingUsers ? (
              <p className="text-slate-400 text-sm">Carregando...</p>
            ) : tenantUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left table-auto">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="py-2 px-3">E-mail</th>
                      <th className="py-2 px-3">Função</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantUsers.map((u) => {
                      const ativo = u.is_active ?? true;
                      return (
                        <tr key={u.id} className="border-b border-slate-800 last:border-b-0">
                          <td className="py-2 px-3">{u.email}</td>
                          <td className="py-2 px-3 text-slate-300">{FUNCOES.find(f => f.value === u.funcao)?.label ?? u.funcao}</td>
                          <td className="py-2 px-3">
                            {ativo ? (
                              <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Ativo</Badge>
                            ) : (
                              <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Suspenso</Badge>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button size="sm" variant="outline" className="border-slate-700 hover:bg-slate-800" onClick={() => openReset(u)}>
                                <KeyRound className="h-3.5 w-3.5 mr-1" />
                                Senha
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className={ativo
                                  ? "border-amber-600/50 text-amber-400 hover:bg-amber-950/40"
                                  : "border-green-600/50 text-green-400 hover:bg-green-950/40"}
                                onClick={() => handleToggleUserStatus(u)}
                              >
                                {ativo ? <><Ban className="h-3.5 w-3.5 mr-1" />Suspender</> : <><CheckCircle className="h-3.5 w-3.5 mr-1" />Ativar</>}
                              </Button>
                              <Button size="sm" variant="outline" className="border-slate-700 hover:bg-slate-800" onClick={() => handleImpersonate(u)}>
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Ver
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">Nenhum usuário nesta denominação.</p>
            )}
          </div>

          <DialogFooter className="border-slate-800 bg-slate-950/50">
            <Button variant="outline" className="border-slate-700 hover:bg-slate-800" onClick={closeUserPanel}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
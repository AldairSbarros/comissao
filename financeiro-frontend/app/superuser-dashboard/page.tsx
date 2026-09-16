"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { DollarSign, Users, CheckCircle, XCircle } from "lucide-react"; // Ícones para os cards
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

export default function SuperuserDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth(); // Assume que useAuth fornece o usuário logado
  const [stats, setStats] = useState<MasterStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    // Redireciona se não for superusuário
    if (!authLoading && (!user || !user.is_superuser)) {
      toast.error("Acesso negado. Apenas superusuários podem acessar este painel.");
      router.push("/"); // Redireciona para a página de login
      return;
    }

    if (user && user.is_superuser) {
      const fetchStats = async () => {
        try {
          const response = await api.get<MasterStats>("/master/stats");
          setStats(response.data);
          toast.success("Estatísticas carregadas com sucesso!");
        } catch (error) {
          console.error("Erro ao buscar estatísticas do Painel Master:", error);
          toast.error("Erro ao carregar estatísticas do sistema.");
        } finally {
          setLoadingStats(false);
        }
      };
      fetchStats();
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
      <h1 className="text-4xl font-bold mb-8 text-emerald-400">Painel Master</h1>

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
                formatter={(value: any) => `${value} tenants`}
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
          {/* Adicione mais informações de sistema conforme necessário */}
        </CardContent>
      </Card>
    </div>
  );
}
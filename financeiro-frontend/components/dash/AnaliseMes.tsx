"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAnalisesMes } from "@/lib/api";
import { AnaliseMes as AnaliseMesType, SemanaResumo, RendaItemResumo, MetodoPagamentoResumo } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Lock, Unlock, FileDown, TrendingUp, TrendingDown, DollarSign, Receipt } from "lucide-react";

// Paleta de cores para os gráficos
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#F88434', '#82CAFF', '#FFC0CB'];

const formatarMoeda = (valor: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
};

interface Propriedades {
  mesId: number;
  nomeMes: string;
  fechado: boolean;
  saldoInicial: number;
  saldoFinal: number;
}

export default function AnaliseMes({ mesId, nomeMes, fechado, saldoInicial, saldoFinal }: Propriedades) {
  const { user } = useAuth();
  const [data, setData] = useState<AnaliseMesType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregarAnalise() {
      if (!mesId) return;
      setLoading(true);
      try {
        const analise = await getAnalisesMes(mesId);
        setData(analise);
      } catch (err) {
        console.error("Erro ao carregar análise do mês:", err);
      } finally {
        setLoading(false);
      }
    }
    carregarAnalise();
  }, [mesId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Análise Financeira - {nomeMes}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">Carregando dados de análise...</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Análise Financeira - {nomeMes}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">Não foi possível carregar a análise.</p>
        </CardContent>
      </Card>
    );
  }

  const { series_entradas_saida, principais_rendas, resumo_pagamentos, totais } = data;

  // Dados preparados para o gráfico de barras (Entradas vs Saidas)
  const dadosBarras = series_entradas_saida.map(item => ({
    label: item.label,
    Entradas: item.entradas,
    Saídas: item.saidas,
    Saldo: item.saldo_acumulado
  }));

  // Dados para o gráfico de pizza (Rendas por Tipo)
  const dadosRendas = principais_rendas.map(item => ({
    name: item.tipo,
    value: item.total
  }));

  // Dados para o gráfico de pizza (Pagamentos)
  const dadosPagamentos = resumo_pagamentos.map(item => ({
    name: item.metodo_pagamento,
    value: item.total
  }));

  return (
    <div className="grid gap-6">
      {/* Cards de Totais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Entradas Brutas
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-green-700">
              {formatarMoeda(totais.entradas_brutas)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-red-600" />
              Despesas
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-red-700">
              {formatarMoeda(totais.despesas)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Saldo Inicial
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-700">
              {formatarMoeda(totais.saldo_inicial)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-purple-600" />
              Saldo Final
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-purple-700">
              {formatarMoeda(totais.saldo_final)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Gráfico de Barras: Entradas vs Saídas + Saldo Acumulado */}
      <Card>
        <CardHeader>
          <CardTitle>Fluxo Financeiro Semanal (Entradas vs Saídas)</CardTitle>
          <CardDescription>Visualização do fluxo de caixa ao longo das semanas do mês</CardDescription>
        </CardHeader>
        <CardContent>
          {series_entradas_saida.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosBarras} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => formatarMoeda(value)} />
                <YAxis type="category" dataKey="label" width={50} />
                <Tooltip formatter={(value: number) => formatarMoeda(value)} />
                <Legend />
                <Bar dataKey="Entradas" fill="#00C49F" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Saídas" fill="#FF8042" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">Nenhuma semana lançada neste mês.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Gráfico de Pizza: Rendas por Tipo */}
        <Card>
          <CardHeader>
            <CardTitle>Rendas por Tipo</CardTitle>
            <CardDescription>Distribuição das rendas por categoria</CardDescription>
          </CardHeader>
          <CardContent>
            {principais_rendas.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dadosRendas}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {dadosRendas.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatarMoeda(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nenhuma renda lançada.</p>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de Pizza: Métodos de Pagamento */}
        <Card>
          <CardHeader>
            <CardTitle>Métodos de Pagamento</CardTitle>
            <CardDescription>Como as rendas foram pagas</CardDescription>
          </CardHeader>
          <CardContent>
            {resumo_pagamentos.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dadosPagamentos}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {dadosPagamentos.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatarMoeda(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nenhum pagamento registrado.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
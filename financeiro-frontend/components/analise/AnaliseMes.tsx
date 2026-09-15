import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getAnalisesMes } from "@/lib/api";
import { AnaliseMes, SemanaResumo, RendaItemResumo, MetodoPagamentoResumo } from "@/lib/types";

interface AnaliseMesProps {
  mesId: number;
}

/** Cores padrão para os gráficos de pizza */
const PIE_COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff8042",
  "#8dd1e1",
  "#a4de6c",
  "#d0ed57",
  "#ffc0cb",
];

export const AnaliseMes: React.FC<AnaliseMesProps> = ({ mesId }) => {
  const [analise, setAnalise] = useState<AnaliseMes | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getAnalises(mesId);
        setAnalise(data);
      } catch (e: any) {
        setError(e.message ?? "Erro ao carregar análise");
      } finally {
        setLoading(false);
      }
    })();
  }, [mesId]);

  if (loading) return <p>Carregando análise...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!analise) return null;

  const {
    nome_mes,
    series_entradas_saida,
    principais_rendas,
    resumo_pagamentos,
    totais,
  } = analise;

  /* ---------- Gráficos ---------- */
  const renderBarChart = () => (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={series_entradas_saida} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="entradas" fill="#82ca9d" name="Entradas" />
        <Bar dataKey="saidas" fill="#ff8042" name="Despesas" />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderRendaPie = () => (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={principais_rendas}
          dataKey="total"
          nameKey="tipo"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ percent, nome }) => `${nome} ${(percent * 100).toFixed(0)}%`}
        >
          {principais_rendas.map((_, idx) => (
            <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
      </PieChart>
    </ResponsiveContainer>
  );

  const renderMetodoPagamentoPie = () => (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={resumo_pagamentos}
          dataKey="total"
          nameKey="metodo_pagamento"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ percent, nome }) => `${nome} ${(percent * 100).toFixed(0)}%`}
        >
          {resumo_pagamentos.map((_, idx) => (
            <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
      </PieChart>
    </ResponsiveContainer>
  );

  /* ---------- Cards de Totais ---------- */
  const renderTotais = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardHeader>
          <CardTitle>Saldo Inicial</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold">R$ {totais.saldo_inicial.toFixed(2)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entradas Brutas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold">R$ {totais.entradas_brutas.toFixed(2)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Despesas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold">R$ {totais.despesas.toFixed(2)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldo Final</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-xl font-bold ${totais.saldo_final >= 0 ? "text-green-600" : "text-red-600"}`}>
            R$ {totais.saldo_final.toFixed(2)}
          </p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <section className="p-4">
      <h2 className="text-2xl font-bold mb-4">{nome_mes} – Análise Completa</h2>

      {/* Totais */}
      {renderTotais()}

      {/* Gráfico de Barras – Entradas vs Despesas por Semana */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Entradas × Despesas por Semana</CardTitle>
          <CardDescription>Comparativo semanal</CardDescription>
        </CardHeader>
        <CardContent>{renderBarChart()}</CardContent>
      </Card>

      {/* Gráficos de Pizza – Rendas por Tipo & Métodos de Pagamento */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Principais Rendas (por Tipo)</CardTitle>
          </CardHeader>
          <CardContent>{renderRendaPie()}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo por Método de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>{renderMetodoPagamentoPie()}</CardContent>
        </Card>
      </div>
    </section>
  );
};
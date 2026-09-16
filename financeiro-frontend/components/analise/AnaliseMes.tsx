// financeiro-frontend/components/analise/AnaliseMes.tsx
"use client";

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { AnaliseMes as AnaliseMesType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface AnaliseMesProps {
  mesId: number;
}

const COLORS = ["#10b981", "#3b82f6", "#f97316", "#ef4444", "#8b5cf6"];

export default function AnaliseMes({ mesId }: AnaliseMesProps) {
  const [analise, setAnalise] = useState<AnaliseMesType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (mesId) {
      const fetchAnalise = async () => {
        setLoading(true);
        try {
          const response = await api.get<AnaliseMesType>(`/meses/${mesId}/analises`);
          setAnalise(response.data);
        } catch (error) {
          toast.error("Erro ao carregar análise do mês.");
          console.error(error);
        } finally {
          setLoading(false);
        }
      };
      fetchAnalise();
    }
  }, [mesId]);

  if (loading) {
    return <div className="text-center text-slate-400">Carregando análise...</div>;
  }

  if (!analise) {
    return <div className="text-center text-slate-400">Não foi possível carregar os dados para análise.</div>;
  }
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
        {`${name} (${(percent * 100).toFixed(0)}%)`}
      </text>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800 text-white">
        <CardHeader>
          <CardTitle>Entradas vs. Saídas</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analise.series_entradas_saida}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="label" stroke="#cbd5e1" />
              <YAxis stroke="#cbd5e1" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} 
                formatter={(value: any) => formatCurrency(value)}
              />
              <Bar dataKey="entradas" fill="#10b981" name="Entradas" />
              <Bar dataKey="saidas" fill="#ef4444" name="Saídas" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-slate-800 text-white">
            <CardHeader>
                <CardTitle>Distribuição por Tipo de Renda</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                    data={analise.principais_rendas}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="total"
                    nameKey="tipo"
                    >
                    {analise.principais_rendas.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800 text-white">
            <CardHeader>
                <CardTitle>Distribuição por Método de Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                    data={analise.resumo_pagamentos}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="total"
                    nameKey="metodo_pagamento"
                    >
                    {analise.resumo_pagamentos.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
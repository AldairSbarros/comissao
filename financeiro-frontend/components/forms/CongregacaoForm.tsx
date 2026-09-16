"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { criarCongregacao, listarDenominacoes, listarAreasPorDenominacao } from "@/lib/api"; // Precisaremos de listarAreasPorDenominacao
import { Denominacao, AreaEclesiastica, Congregacao } from "@/lib/types";

interface CongregacaoFormProps {
  onCongregacaoCriada?: (novaCongregacao: Congregacao) => void;
}

export default function CongregacaoForm({ onCongregacaoCriada }: CongregacaoFormProps) {
  const [nomeCongregacao, setNomeCongregacao] = useState("");
  const [numeroCo, setNumeroCo] = useState("");
  const [denominacaoId, setDenominacaoId] = useState<string>("");
  const [areaId, setAreaId] = useState<string>(""); // Área é opcional
  const [denominacoes, setDenominacoes] = useState<Denominacao[]>([]);
  const [areas, setAreas] = useState<AreaEclesiastica[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDenominacoes, setIsLoadingDenominacoes] = useState(true);
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);

  // Carregar Denominações
  useEffect(() => {
    async function fetchDenominacoes() {
      try {
        const data = await listarDenominacoes();
        setDenominacoes(data);
      } catch (error) {
        toast.error("Erro ao carregar denominações.");
      } finally {
        setIsLoadingDenominacoes(false);
      }
    }
    fetchDenominacoes();
  }, []);

  // Carregar Áreas quando a Denominação muda
  useEffect(() => {
    async function fetchAreas() {
      if (denominacaoId) {
        setIsLoadingAreas(true);
        try {
          const data = await listarAreasPorDenominacao(parseInt(denominacaoId)); // Esta função será adicionada ao api.ts
          setAreas(data);
        } catch (error) {
          toast.error("Erro ao carregar áreas.");
        } finally {
          setIsLoadingAreas(false);
        }
      } else {
        setAreas([]); // Limpa as áreas se nenhuma denominação for selecionada
        setAreaId(""); // Limpa a área selecionada
      }
    }
    fetchAreas();
  }, [denominacaoId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeCongregacao.trim() || !denominacaoId) {
      toast.error("Nome da congregação e denominação são obrigatórios.");
      return;
    }
    setIsLoading(true);
    try {
      const novaCongregacao = await criarCongregacao({
        nome: nomeCongregacao,
        numero_co: numeroCo.trim() || undefined, // Envia undefined se vazio
        denominacao_id: parseInt(denominacaoId),
        area_id: areaId ? parseInt(areaId) : undefined, // Envia undefined se não selecionado
      });
      toast.success(`Congregação "${novaCongregacao.nome}" criada com sucesso!`);
      setNomeCongregacao("");
      setNumeroCo("");
      setDenominacaoId("");
      setAreaId("");
      if (onCongregacaoCriada) onCongregacaoCriada(novaCongregacao);
    } catch (error: any) {
      const errorMessage = error?.message || "Erro ao criar a congregação.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-xl text-white">Cadastrar Congregação</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Select de Denominação */}
          <div className="grid gap-2">
            <Label htmlFor="denominacao" className="text-slate-300">Denominação</Label>
            <Select
              value={denominacaoId}
              onValueChange={(val) => setDenominacaoId(val || "")}
              disabled={isLoading || isLoadingDenominacoes}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:ring-emerald-500">
                <SelectValue placeholder={isLoadingDenominacoes ? "Carregando denominações..." : "Selecione uma denominação"} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 text-white border-slate-700">
                {denominacoes.map((den) => (
                  <SelectItem key={den.id} value={String(den.id)}>
                    {den.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Select de Área (depende da Denominação) */}
          <div className="grid gap-2">
            <Label htmlFor="area" className="text-slate-300">Área/Zona/Distrito (Opcional)</Label>
            <Select
              value={areaId}
              onValueChange={(val) => setAreaId(val || "")}
              disabled={isLoading || isLoadingAreas || !denominacaoId} // Desabilita se não houver denominação ou estiver carregando
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:ring-emerald-500">
                <SelectValue placeholder={isLoadingAreas ? "Carregando áreas..." : "Selecione uma área (opcional)"} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 text-white border-slate-700">
                {areas.length === 0 && !isLoadingAreas && (
                    <SelectItem value="" disabled>Nenhuma área disponível</SelectItem>
                )}
                {areas.map((area) => (
                  <SelectItem key={area.id} value={String(area.id)}>
                    {area.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Input para Nome da Congregação */}
          <div className="grid gap-2">
            <Label htmlFor="nomeCongregacao" className="text-slate-300">Nome da Congregação</Label>
            <Input
              id="nomeCongregacao"
              type="text"
              placeholder="Ex: Congregação Betel"
              value={nomeCongregacao}
              onChange={(e) => setNomeCongregacao(e.target.value)}
              required
              disabled={isLoading}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:ring-emerald-500"
            />
          </div>

          {/* Input para Número CO (Opcional) */}
          <div className="grid gap-2">
            <Label htmlFor="numeroCo" className="text-slate-300">Número CO (Opcional)</Label>
            <Input
              id="numeroCo"
              type="text"
              placeholder="Ex: 12345"
              value={numeroCo}
              onChange={(e) => setNumeroCo(e.target.value)}
              disabled={isLoading}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:ring-emerald-500"
            />
          </div>

          <Button type="submit" disabled={isLoading || isLoadingDenominacoes || !denominacaoId} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            {isLoading ? "Cadastrando..." : "Cadastrar Congregação"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
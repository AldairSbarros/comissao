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
import { criarArea, listarDenominacoes } from "@/lib/api"; // Precisaremos de listarDenominacoes
import { Denominacao, AreaEclesiastica } from "@/lib/types";

interface AreaFormProps {
  onAreaCriada?: (novaArea: AreaEclesiastica) => void;
}

export default function AreaForm({ onAreaCriada }: AreaFormProps) {
  const [nomeArea, setNomeArea] = useState("");
  const [tipoArea, setTipoArea] = useState<string>(""); // NOVO ESTADO para o tipo de área
  const [denominacaoId, setDenominacaoId] = useState<string>(""); // ID como string para o Select
  const [denominacoes, setDenominacoes] = useState<Denominacao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDenominacoes, setIsLoadingDenominacoes] = useState(true);

  useEffect(() => {
    async function fetchDenominacoes() {
      try {
        const data = await listarDenominacoes(); // Esta função será adicionada ao api.ts
        setDenominacoes(data);
      } catch (error) {
        toast.error("Erro ao carregar denominações.");
      } finally {
        setIsLoadingDenominacoes(false);
      }
    }
    fetchDenominacoes();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ATUALIZAR VALIDAÇÃO
    if (!nomeArea.trim() || !denominacaoId || !tipoArea) {
      toast.error("Nome da área, tipo e denominação são obrigatórios.");
      return;
    }
    setIsLoading(true);
    try {
      // ATUALIZAR O NOME ENVIADO PARA INCLUIR O TIPO
      const nomeCompletoArea = `${tipoArea} ${nomeArea}`; // Ex: "Área Central"
      const novaArea = await criarArea({
        nome: nomeCompletoArea, // Envia o nome formatado
        denominacao_id: parseInt(denominacaoId),
      });
      toast.success(`Área "${novaArea.nome}" criada com sucesso!`);
      setNomeArea("");
      setTipoArea(""); // Limpa o tipo de área
      setDenominacaoId("");
      if (onAreaCriada) onAreaCriada(novaArea);
    } catch (error: any) {
      const errorMessage = error?.message || "Erro ao criar a área.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-xl text-white">Cadastrar Área/Zona/Distrito</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
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

          {/* NOVO: SELECT PARA TIPO DE ÁREA */}
          <div className="grid gap-2">
            <Label htmlFor="tipoArea" className="text-slate-300">Tipo</Label>
            <Select
              value={tipoArea}
              onValueChange={(val) => setTipoArea(val || "")}
              disabled={isLoading}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:ring-emerald-500">
                <SelectValue placeholder="Selecione o tipo de área" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 text-white border-slate-700">
                <SelectItem value="Área">Área</SelectItem>
                <SelectItem value="Zona">Zona</SelectItem>
                <SelectItem value="Distrito">Distrito</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nomeArea" className="text-slate-300">Nome Específico</Label>
            <Input
              id="nomeArea"
              type="text"
              placeholder="Ex: Central, Leste 1, etc."
              value={nomeArea}
              onChange={(e) => setNomeArea(e.target.value)}
              required
              disabled={isLoading}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:ring-emerald-500"
            />
          </div>
          <Button type="submit" disabled={isLoading || isLoadingDenominacoes || !tipoArea} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            {isLoading ? "Cadastrando..." : "Cadastrar Área"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
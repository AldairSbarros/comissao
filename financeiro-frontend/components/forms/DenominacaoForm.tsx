"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { criarDenominacao } from "@/lib/api"; // Vamos adicionar esta função ao api.ts

export default function DenominacaoForm() {
  const [nomeDenominacao, setNomeDenominacao] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeDenominacao.trim()) {
      toast.error("O nome da denominação é obrigatório.");
      return;
    }
    setIsLoading(true);
    try {
      const novaDenominacao = await criarDenominacao({ nome: nomeDenominacao });
      toast.success(`Denominação "${novaDenominacao.nome}" criada com sucesso!`);
      setNomeDenominacao("");
      // Opcional: Redirecionar ou mostrar o próximo formulário (Área)
    } catch (error: any) {
      const errorMessage = error?.message || "Erro ao criar a denominação.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-xl text-white">Cadastrar Denominação</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nomeDenominacao" className="text-slate-300">Nome da Denominação</Label>
            <Input
              id="nomeDenominacao"
              type="text"
              placeholder="Ex: Assembleia de Deus"
              value={nomeDenominacao}
              onChange={(e) => setNomeDenominacao(e.target.value)}
              required
              disabled={isLoading}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:ring-emerald-500"
            />
          </div>
          <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            {isLoading ? "Cadastrando..." : "Cadastrar Denominação"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
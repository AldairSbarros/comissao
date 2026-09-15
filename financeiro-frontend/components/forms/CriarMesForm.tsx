"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { criarMes } from "@/lib/api";
import { toast } from "sonner";
import { Mes } from "@/lib/types";

interface CriarMesFormProps {
  onMesCriado: (novoMes: Mes) => void;
}

export default function CriarMesForm({ onMesCriado }: CriarMesFormProps) {
  const [nomeMes, setNomeMes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeMes.trim() || !user?.congregacao_id) {
      toast.error("O nome do mês é obrigatório.");
      return;
    }
    setIsLoading(true);
    try {
      // A função `criarMes` ainda não existe em `lib/api.ts`, vou criá-la a seguir.
      const novoMes = await criarMes({
        nome: nomeMes,
        congregacao_id: user.congregacao_id,
      });
      toast.success(`Mês "${novoMes.nome}" criado com sucesso!`);
      onMesCriado(novoMes); // Notifica o componente pai que um novo mês foi criado
      setNomeMes("");
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.detail || "Erro ao criar o mês.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar Novo Mês Financeiro</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-4">
          <Input
            type="text"
            placeholder="Ex: Janeiro/2024"
            value={nomeMes}
            onChange={(e) => setNomeMes(e.target.value)}
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Criando..." : "Criar Mês"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
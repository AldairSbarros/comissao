"use client";

import GestaoMes from "@/components/dash/GestaoMes";
import { GestaoDizimistas } from "@/components/dash/GestaoDizimistas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";

// Painel financeiro do tesoureiro: meses/semanas (rendas e despesas) + dizimistas.
// Usado em /dashboard (quando o usuário tem congregacao_id) e em /dashboard/tesoureiro.
export default function PainelFinanceiro() {
  const { user } = useAuth();
  const congregacaoId = user?.congregacao_id;

  return (
    <Tabs defaultValue="financeiro" className="space-y-4">
      <TabsList>
        <TabsTrigger value="financeiro">Financeiro (Meses)</TabsTrigger>
        <TabsTrigger value="membros">Dizimistas / Ofertantes</TabsTrigger>
      </TabsList>

      <TabsContent value="financeiro" className="space-y-4">
        <GestaoMes />
      </TabsContent>

      <TabsContent value="membros" className="space-y-4">
        {congregacaoId ? (
          <GestaoDizimistas congregacaoId={congregacaoId} />
        ) : (
          <p>Carregando dados do usuário...</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
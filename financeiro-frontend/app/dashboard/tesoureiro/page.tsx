"use client";

import { useEffect, useState } from "react";
import GestaoMes from "@/components/dash/GestaoMes";
import { GestaoDizimistas } from "@/components/dash/GestaoDizimistas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMe } from "@/lib/api";
import { Usuario } from "@/lib/types";

export default function PaginaTesoureiro() {
  const [user, setUser] = useState<Usuario | null>(null);
  useEffect(() => {
    getMe().then(setUser).catch(console.error);
  }, []);

  return (
    <div className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold tracking-tight mb-6">
        Painel do Tesoureiro
      </h1>

      <Tabs defaultValue="financeiro" className="space-y-4">
        <TabsList>
          <TabsTrigger value="financeiro">Financeiro (Meses)</TabsTrigger>
          <TabsTrigger value="membros">Dizimistas / Ofertantes</TabsTrigger>
        </TabsList>
        
        <TabsContent value="financeiro" className="space-y-4">
          <GestaoMes />
        </TabsContent>
        
        <TabsContent value="membros" className="space-y-4">
          {user?.congregacao_id ? (
            <GestaoDizimistas congregacaoId={user.congregacao_id} />
          ) : (
            <p>Carregando dados do usuário...</p>
          )}
        </TabsContent>
      </Tabs>

    </div>
  );
}
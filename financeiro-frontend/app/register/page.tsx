"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DenominacaoForm from "@/components/forms/DenominacaoForm"; // Vamos criar este componente a seguir

export default function RegisterPage() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-slate-950 text-white">
      <Card className="w-full max-w-2xl bg-slate-900 border-slate-800">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Cadastro Inicial do Sistema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-slate-400 text-center">
            Comece cadastrando a Denominação principal da sua igreja.
            Após isso, você poderá adicionar Áreas, Congregações e Usuários.
          </p>

          {/* Componente para cadastrar Denominação */}
          <DenominacaoForm />

          <div className="flex justify-center mt-6">
            <Button 
              variant="outline" 
              className="border-slate-700 hover:bg-slate-800 hover:text-white"
              onClick={() => router.push('/')}
            >
              Voltar para o Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
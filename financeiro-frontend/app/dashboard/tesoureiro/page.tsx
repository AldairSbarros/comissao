"use client";

import PainelFinanceiro from "@/components/dash/PainelFinanceiro";

export default function PaginaTesoureiro() {
  return (
    <div className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold tracking-tight mb-6">
        Painel do Tesoureiro
      </h1>
      <PainelFinanceiro />
    </div>
  );
}
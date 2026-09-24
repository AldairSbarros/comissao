"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet, ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import PainelFinanceiro from "@/components/dash/PainelFinanceiro";
import PainelAdministrador from "@/components/dash/PainelAdministrador";

const FUNCOES_ADMINISTRATIVAS = ["administrador", "supervisor_denominacao", "supervisor_area"];

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout, isImpersonating, restoreSuperuser } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/");
    } else if (user.is_superuser) {
      router.push("/superuser-dashboard");
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F19] text-white">
        <div className="flex flex-col items-center gap-4 text-slate-400 animate-pulse">
          <Wallet className="w-12 h-12 text-emerald-500/50" />
          <p>Carregando painel...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Redirecionamento em andamento
  }

  const ehTesoureiro = user.funcao === "tesoureiro" || (user.congregacao_id != null && !FUNCOES_ADMINISTRATIVAS.includes(user.funcao));
  const titulo = ehTesoureiro ? "Painel do Tesoureiro" : "Painel Administrativo";

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0F19] text-white p-6 md:p-10 font-sans">
      {isImpersonating && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-600/40 bg-amber-950/30 px-4 py-3">
          <p className="text-sm text-amber-300">
            Você está personificando <span className="font-semibold text-amber-100">{user.sub}</span>.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-600/50 text-amber-300 hover:bg-amber-900/40 hover:text-amber-200"
            onClick={() => {
              if (restoreSuperuser()) {
                toast.success("Modo superuser restaurado.");
                router.push("/superuser-dashboard");
              } else {
                toast.error("Não foi possível restaurar o modo superuser.");
              }
            }}
          >
            <ShieldCheck className="mr-1 h-4 w-4" />
            Voltar ao modo superuser
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{titulo}</h1>
        <Button onClick={logout} variant="outline" className="border-slate-700 hover:bg-slate-800 hover:text-white">
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>

      {ehTesoureiro ? <PainelFinanceiro /> : <PainelAdministrador />}
    </div>
  );
}
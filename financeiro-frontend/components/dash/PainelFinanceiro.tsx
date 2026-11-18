"use client";

import { useEffect, useState } from "react";
import { Church } from "lucide-react";
import GestaoMes from "@/components/dash/GestaoMes";
import { GestaoDizimistas } from "@/components/dash/GestaoDizimistas";
import DespesasDashboard from "@/components/dash/DespesasDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { listarCongregacoesPorDenominacao } from "@/lib/api";
import { Congregacao } from "@/lib/types";

// Painel financeiro: meses/semanas (rendas e despesas) + dizimistas.
// Tesoureiro/dirigente veem a propria congregacao; pastor/admin selecionam entre as congregacoes.
export default function PainelFinanceiro() {
  const { user } = useAuth();
  const [congregacoes, setCongregacoes] = useState<Congregacao[]>([]);
  const [selecionadaId, setSelecionadaId] = useState<number | undefined>(undefined);
  const [carregandoCongs, setCarregandoCongs] = useState(false);

  const ehFixo = Boolean(user?.congregacao_id);

  useEffect(() => {
    if (ehFixo || !user?.denominacao_id) return;
    let ativo = true;
    setCarregandoCongs(true);
    listarCongregacoesPorDenominacao(user.denominacao_id)
      .then((lista) => {
        if (!ativo) return;
        const filtradas =
          user.funcao === "supervisor_area" && user.area_id != null
            ? lista.filter((c) => c.area_id === user.area_id)
            : lista;
        setCongregacoes(filtradas);
        if (filtradas.length > 0) {
          setSelecionadaId((atual) =>
            atual && filtradas.some((c) => c.id === atual) ? atual : filtradas[0].id
          );
        }
      })
      .catch(() => {
        if (ativo) setCongregacoes([]);
      })
      .finally(() => {
        if (ativo) setCarregandoCongs(false);
      });
    return () => {
      ativo = false;
    };
  }, [ehFixo, user?.denominacao_id, user?.funcao, user?.area_id]);

  const congregacaoId = user?.congregacao_id ?? selecionadaId;

  if (!ehFixo && carregandoCongs && congregacoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Carregando congregações...</p>;
  }

  if (!ehFixo && !carregandoCongs && congregacoes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma congregação encontrada. Acesse &ldquo;Cadastros e Equipe&rdquo; para cadastrar uma congregação.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {!ehFixo && congregacoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mr-2">
            <Church className="h-4 w-4 text-emerald-500" />
            Congregação:
          </span>
          {congregacoes.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={congregacaoId === c.id ? "default" : "outline"}
              onClick={() => setSelecionadaId(c.id)}
            >
              {c.nome}
              {c.numero_co ? ` (${c.numero_co})` : ""}
            </Button>
          ))}
        </div>
      )}

      <Tabs defaultValue="financeiro" className="space-y-4">
        <TabsList>
          <TabsTrigger value="financeiro">Financeiro (Meses)</TabsTrigger>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
          <TabsTrigger value="membros">Dizimistas / Ofertantes</TabsTrigger>
        </TabsList>

        <TabsContent value="financeiro" className="space-y-4">
          {congregacaoId ? (
            <GestaoMes key={`mes-${congregacaoId}`} congregacaoId={congregacaoId} />
          ) : (
            <p>Carregando dados da congregação...</p>
          )}
        </TabsContent>

        <TabsContent value="despesas" className="space-y-4">
          {congregacaoId ? (
            <DespesasDashboard key={`desp-${congregacaoId}`} congregacaoId={congregacaoId} />
          ) : (
            <p>Carregando dados do usuário...</p>
          )}
        </TabsContent>

        <TabsContent value="membros" className="space-y-4">
          {congregacaoId ? (
            <GestaoDizimistas key={`diz-${congregacaoId}`} congregacaoId={congregacaoId} />
          ) : (
            <p>Carregando dados do usuário...</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
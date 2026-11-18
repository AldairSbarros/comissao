"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PlusCircle, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { adicionarDespesa, listarMeses, removerDespesa } from "@/lib/api";
import { Mes } from "@/lib/types";

// Dashboard proprio de despesas: cartoes do caixa de 33%, lancamento rapido
// por semana e tabela consolidada do mes. Dirigente ve tudo, sem editar.
export default function DespesasDashboard({ congregacaoId }: { congregacaoId: number }) {
  const { user } = useAuth();
  const somenteLeitura = user?.funcao === "dirigente";
  const [meses, setMeses] = useState<Mes[]>([]);
  const [mesId, setMesId] = useState<string>("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [semanaNumero, setSemanaNumero] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dataRegistro, setDataRegistro] = useState("");

  const recarregar = async () => {
    try {
      const lista = await listarMeses(congregacaoId);
      setMeses(lista);
      if (!mesId && lista.length > 0) setMesId(String(lista[0].id));
    } catch {
      toast.error("Falha ao carregar meses.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    async function carregarInicial() {
      await recarregar();
    }
    carregarInicial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [congregacaoId]);

  const mes = useMemo(() => meses.find((m) => String(m.id) === mesId) || null, [meses, mesId]);
  const semanaSelecionada = useMemo(
    () => mes?.semanas.find((s) => String(s.numero) === semanaNumero) || null,
    [mes, semanaNumero]
  );

  const totais = useMemo(() => {
    if (!mes) return { entradas: 0, comissao: 0, despesas: 0 };
    const entradas = mes.semanas.reduce((acc, s) => acc + (s.renda_semanal || 0), 0);
    const comissao = mes.semanas.reduce((acc, s) => acc + (s.comissao || 0), 0);
    const despesas = mes.semanas.reduce((acc, s) => acc + s.despesas.reduce((a, d) => a + d.valor, 0), 0);
    return { entradas, comissao, despesas };
  }, [mes]);

  const despesasDoMes = useMemo(() => {
    if (!mes) return [];
    return mes.semanas.flatMap((s) =>
      s.despesas.map((d) => ({ ...d, semanaNumero: s.numero }))
    );
  }, [mes]);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mes || !semanaNumero) {
      toast.error("Selecione a semana.");
      return;
    }
    const valorNum = parseFloat(valor);
    if (!descricao.trim() || !valorNum || valorNum <= 0) {
      toast.error("Informe descrição e valor válido.");
      return;
    }
    setSalvando(true);
    try {
      await adicionarDespesa(mes.id, Number(semanaNumero), {
        descricao: descricao.trim(),
        valor: valorNum,
        data_registro: dataRegistro || undefined,
      });
      toast.success("Despesa lançada!");
      setDescricao("");
      setValor("");
      setDataRegistro("");
      await recarregar();
    } catch (err: unknown) {
      const detalhe = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detalhe || "Erro ao lançar despesa.");
    } finally {
      setSalvando(false);
    }
  };

  const handleRemover = async (despesaId: number) => {
    if (!confirm("Excluir esta despesa?")) return;
    try {
      await removerDespesa(despesaId);
      toast.success("Despesa excluída.");
      await recarregar();
    } catch {
      toast.error("Erro ao excluir despesa.");
    }
  };

  if (carregando) return <p>Carregando despesas...</p>;
  if (meses.length === 0) return <p>Nenhum mês financeiro foi criado ainda.</p>;

  return (
    <div className="space-y-4">
      <div className="max-w-xs space-y-1">
        <Label>Mês</Label>
        <Select value={mesId} onValueChange={(v) => setMesId(v || "")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {meses.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.nome} {m.fechado ? "(fechado)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mes && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="text-lg font-bold">R$ {mes.saldo_inicial.toFixed(2)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Entradas</p><p className="text-lg font-bold text-green-500">R$ {totais.entradas.toFixed(2)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Comissão (33%)</p><p className="text-lg font-bold text-blue-500">R$ {totais.comissao.toFixed(2)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Despesas</p><p className="text-lg font-bold text-red-500">R$ {totais.despesas.toFixed(2)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Sobra p/ gastar</p><p className="text-lg font-bold text-emerald-400">R$ {mes.saldo_final.toFixed(2)}</p></CardContent></Card>
          </div>

          {!somenteLeitura && !mes.fechado && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" /> Lançar despesa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSalvar} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <div className="space-y-1">
                    <Label>Semana *</Label>
                    <Select value={semanaNumero} onValueChange={(v) => setSemanaNumero(v || "")}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {mes.semanas.map((s) => (
                          <SelectItem key={s.id} value={String(s.numero)}>Semana {s.numero}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Descrição *</Label>
                    <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Conta de luz" />
                  </div>
                  <div className="space-y-1">
                    <Label>Valor (R$) *</Label>
                    <Input type="number" step="0.01" min="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={dataRegistro}
                      onChange={(e) => setDataRegistro(e.target.value)}
                      min={semanaSelecionada?.data_inicio || undefined}
                      max={semanaSelecionada?.data_fim || undefined}
                    />
                  </div>
                  <Button type="submit" disabled={salvando} className="md:col-span-5">
                    {salvando ? "Salvando..." : "Salvar despesa"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Despesas do mês ({despesasDoMes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {despesasDoMes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Nenhuma despesa lançada neste mês.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {despesasDoMes.map((d) => (
                    <li key={d.id} className="flex justify-between items-center py-1.5 border-b border-border/50 group">
                      <div>
                        <span className="font-medium">{d.descricao}</span>
                        <span className="text-muted-foreground text-xs block">
                          Semana {d.semanaNumero}{d.data_registro ? ` • ${d.data_registro}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-red-400">R$ {d.valor.toFixed(2)}</span>
                        {!somenteLeitura && !mes.fechado && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-500" onClick={() => handleRemover(d.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

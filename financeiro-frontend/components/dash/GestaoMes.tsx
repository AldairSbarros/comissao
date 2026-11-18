"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  listarMeses,
  fecharMes,
  reabrirMes,
  getBalancetePdfUrl,
  getDizimistasPdfUrl,
  getPlanilhaMesUrl,
  getPlanilhaSemanaUrl,
  adicionarSemana,
  adicionarRenda,
  removerRenda,
  adicionarDespesa,
  removerDespesa,
  listarDizimistas,
  agradecerRenda,
  agradecerSemana
} from "@/lib/api";
import { Mes, RendaCreateData, DespesaCreateData, DizimistaOfertante } from "@/lib/types";
import CriarMesForm from "@/components/forms/CriarMesForm";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, FileDown, FileSpreadsheet, PlusCircle, Trash2, MessageCircle, CheckCheck } from "lucide-react";
import { RendaForm } from "@/components/forms/RendaForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Nova importação do componente de análise de mês (versão completa do dash)
import AnaliseMes from "@/components/dash/AnaliseMes";
import RecibosSemana from "@/components/dash/RecibosSemana";

export default function GestaoMes({ congregacaoId }: { congregacaoId?: number }) {
  const { user } = useAuth();
  const alvoCongregacaoId = congregacaoId ?? user?.congregacao_id;
  const [meses, setMeses] = useState<Mes[]>([]);
  const [dizimistas, setDizimistas] = useState<DizimistaOfertante[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // States for Despesa Form manually handled here for simplicity, or could extract to DespesaForm component
  const [isDespesaModalOpen, setIsDespesaModalOpen] = useState(false);
  const [selectedSemanaForDespesa, setSelectedSemanaForDespesa] = useState<{mesId: number, semanaNum: number, dataIni: string, dataFim: string} | null>(null);
  const [despesaDescricao, setDespesaDescricao] = useState("");
  const [despesaValor, setDespesaValor] = useState("");
  const [despesaData, setDespesaData] = useState("");

  // Estado para controle da visualização da análise de um mês
  const [mesIdParaAnalise, setMesIdParaAnalise] = useState<number | null>(null);

  useEffect(() => {
    async function carregarDadosIniciais() {
      if (alvoCongregacaoId) {
        setIsLoading(true);
        setMesIdParaAnalise(null);
        try {
          const [mesesDaApi, dizimistasDaApi] = await Promise.all([
            listarMeses(alvoCongregacaoId),
            listarDizimistas(alvoCongregacaoId)
          ]);
          setMeses(mesesDaApi);
          setDizimistas(dizimistasDaApi);
        } catch (error) {
          toast.error("Falha ao carregar dados iniciais.");
        } finally {
          setIsLoading(false);
        }
      }
    }
    carregarDadosIniciais();
  }, [alvoCongregacaoId]);

  // Função para fechar a visualização de análise
  const fecharAnalise = () => setMesIdParaAnalise(null);

  const recarregarMeses = async () => {
    if (alvoCongregacaoId) {
      const mesesDaApi = await listarMeses(alvoCongregacaoId);
      setMeses(mesesDaApi);
    }
  };

    const handleMesCriado = (novoMes: Mes) => {
    setMeses([novoMes, ...meses]);
  };

  const handleStatusMes = async (mesId: number, acao: 'fechar' | 'reabrir') => {
    if (!confirm(`Deseja realmente ${acao} este mês?`)) return;
    setIsProcessing(true);
    try {
      if (acao === 'fechar') await fecharMes(mesId);
      else await reabrirMes(mesId);
      toast.success(`Mês ${acao === 'fechar' ? 'fechado' : 'reaberto'} com sucesso!`);
      await recarregarMeses();
    } catch (err: any) {
      toast.error(err.message || `Erro ao ${acao} o mês.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPdf = async (mesId: number) => {
    try {
      const url = await getBalancetePdfUrl(mesId);
      window.open(url, '_blank');
    } catch (err) {
      toast.error("Erro ao gerar PDF.");
    }
  };

  const baixarXlsx = (url: string, nomeArquivo: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDownloadPlanilhaMes = async (mesId: number, nomeMes: string) => {
    try {
      const url = await getPlanilhaMesUrl(mesId);
      baixarXlsx(url, `planilha_${nomeMes.replace('/', '-')}.xlsx`);
    } catch (err) {
      toast.error("Erro ao gerar planilha do mês.");
    }
  };

  const handleDownloadPlanilhaSemana = async (semanaId: number, numero: number) => {
    try {
      const url = await getPlanilhaSemanaUrl(semanaId);
      baixarXlsx(url, `planilha_semana_${numero}.xlsx`);
    } catch (err) {
      toast.error("Erro ao gerar planilha da semana.");
    }
  };

  const handleNovaSemana = async (mesId: number, numeroNovaSemana: number) => {
    // Para simplificar, assumindo que datas podem ser nulas ou inseridas via um prompt/modal
    // Em um sistema real, você teria um modal para as datas da semana
    const data_inicio = prompt("Data Início da Semana (YYYY-MM-DD):");
    const data_fim = prompt("Data Fim da Semana (YYYY-MM-DD):");
    if(!data_inicio || !data_fim) return;

    try {
      await adicionarSemana(mesId, {
        numero: numeroNovaSemana,
        data_inicio,
        data_fim,
        renda_semanal: 0,
        despesas: []
      });
      toast.success("Semana adicionada!");
      await recarregarMeses();
    } catch(err: any) {
      toast.error(err.message || "Erro ao adicionar semana");
    }
  };

  const handleSubmitRenda = async (semanaId: number, data: RendaCreateData) => {
    try {
      await adicionarRenda(semanaId, data);
      toast.success("Renda lançada com sucesso!");
      await recarregarMeses();
    } catch(err: any) {
      throw err; // Pass down to the form
    }
  };

  const handleRemoverRenda = async (rendaId: number) => {
    if(!confirm("Excluir esta renda?")) return;
    try {
      await removerRenda(rendaId);
      toast.success("Renda excluída");
      await recarregarMeses();
    } catch(err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
  };

  const detalheErro = (err: unknown, padrao: string): string => {
    if (typeof err === "object" && err !== null && "response" in err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      if (detail) return detail;
    }
    if (err instanceof Error) return err.message;
    return padrao;
  };

  const handleAgradecerRenda = async (rendaId: number) => {
    try {
      const res = await agradecerRenda(rendaId);
      toast.success(`Agradecimento enviado por WhatsApp${res.com_imagem ? " com a foto do recibo" : ""}!`);
      await recarregarMeses();
    } catch(err: unknown) {
      toast.error(detalheErro(err, "Erro ao enviar agradecimento."));
    }
  };

  const handleAgradecerSemana = async (semanaId: number) => {
    if(!confirm("Enviar agradecimento por WhatsApp para todos da semana?")) return;
    setIsProcessing(true);
    try {
      const res = await agradecerSemana(semanaId);
      toast.success(`Enviadas: ${res.enviadas.length} • Já enviadas: ${res.ja_enviadas.length} • Sem telefone: ${res.sem_telefone.length} • Falhas: ${res.falhas.length}`);
      await recarregarMeses();
    } catch(err: unknown) {
      toast.error(detalheErro(err, "Erro ao enviar agradecimentos."));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!selectedSemanaForDespesa) return;
    setIsProcessing(true);
    try {
      await adicionarDespesa(
        selectedSemanaForDespesa.mesId, 
        selectedSemanaForDespesa.semanaNum, 
        {
          descricao: despesaDescricao,
          valor: parseFloat(despesaValor),
          data_registro: despesaData || undefined
        }
      );
      toast.success("Despesa adicionada!");
      setIsDespesaModalOpen(false);
      setDespesaDescricao(""); setDespesaValor(""); setDespesaData("");
      await recarregarMeses();
    } catch(err: any) {
      toast.error(err.message || "Erro ao adicionar despesa");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoverDespesa = async (despesaId: number) => {
    if(!confirm("Excluir esta despesa?")) return;
    try {
      await removerDespesa(despesaId);
      toast.success("Despesa excluída");
      await recarregarMeses();
    } catch(err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
  };

  return (
    <div className="space-y-6">
      <CriarMesForm onMesCriado={handleMesCriado} congregacaoId={alvoCongregacaoId} />

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Meses</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : meses.length === 0 ? (
            <p>Nenhum mês financeiro foi criado ainda.</p>
          ) : (
            <Accordion className="w-full">
              {meses.map((mes) => (
                <AccordionItem value={`mes-${mes.id}`} key={mes.id}>
                                    <AccordionTrigger>
                    <div className="flex justify-between items-center w-full pr-4">
                      <span className="flex items-center gap-2">
                        {mes.fechado ? <Lock className="h-4 w-4 text-red-500" /> : <Unlock className="h-4 w-4 text-green-500" />}
                        {mes.nome}
                      </span>
                      <span className="text-sm font-normal text-muted-foreground">
                        Saldo Final: R$ {mes.saldo_final.toFixed(2)}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="p-4 bg-muted/20 rounded-md border border-border">
                      <div className="flex justify-between items-start mb-4 pb-4 border-b">
                        <div>
                          <p><strong>Saldo Inicial:</strong> R$ {mes.saldo_inicial.toFixed(2)}</p>
                          <p><strong>Saldo Final:</strong> R$ {mes.saldo_final.toFixed(2)}</p>
                          <p><strong>Status:</strong> {mes.fechado ? <span className="text-red-500">Fechado</span> : <span className="text-green-500">Aberto</span>}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(mes.id)}>
                            <FileDown className="h-4 w-4 mr-2" /> Balancete (PDF)
                          </Button>
                          <Button variant="outline" size="sm" onClick={async () => {
                            try {
                              const url = await getDizimistasPdfUrl(mes.id);
                              window.open(url, '_blank');
                            } catch (err) {
                              toast.error("Erro ao gerar PDF de dizimistas.");
                            }
                          }}>
                            <FileDown className="h-4 w-4 mr-2" /> Lista de Dizimistas (PDF)
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDownloadPlanilhaMes(mes.id, mes.nome)}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" /> Planilha do mês (XLSX)
                          </Button>
                          {mes.fechado ? (
                            user?.funcao === 'administrador' && (
                              <Button variant="destructive" size="sm" onClick={() => handleStatusMes(mes.id, 'reabrir')} disabled={isProcessing}>
                                Reabrir Mês (Admin)
                              </Button>
                            )
                          ) : (
                            <Button variant="secondary" size="sm" onClick={() => handleStatusMes(mes.id, 'fechar')} disabled={isProcessing}>
                              <Lock className="h-4 w-4 mr-2" /> Fechar Mês
                            </Button>
                          )}
                            {/* Botão para abrir a análise do mês */}
                            <Button variant="outline" size="sm" onClick={() => setMesIdParaAnalise(mes.id)} disabled={isProcessing}>
                              Ver Análises
                            </Button>
                        </div>
                      </div>
                      {/* Gestão das Semanas */}
                      <div className="space-y-6">
                        {mes.semanas && mes.semanas.length > 0 ? (
                          mes.semanas.map((semana) => (
                            <Card key={semana.id} className="border-l-4 border-l-primary">
                              <CardHeader className="py-3 bg-muted/50 flex flex-row items-center justify-between">
                                <div>
                                  <CardTitle className="text-md">Semana {semana.numero}</CardTitle>
                                  <span className="text-xs text-muted-foreground">{semana.data_inicio} até {semana.data_fim}</span>
                                </div>
                                <div className="text-right text-sm">
                                  <p className="text-green-600 font-semibold">+ Rendas: R$ {semana.renda_semanal.toFixed(2)}</p>
                                  <p className="text-red-600 font-semibold">- Despesas: R$ {semana.despesas.reduce((acc, curr) => acc + curr.valor, 0).toFixed(2)}</p>
                                  <p className="text-blue-600 font-semibold">Comissão (33%): R$ {semana.comissao?.toFixed(2)}</p>
                                  <p className="text-purple-600 font-semibold">Saldo inicial: R$ {semana.saldo_inicial_semana?.toFixed(2)}</p>
                                  <p className="font-bold border-t border-border mt-1 pt-1">Fim: R$ {semana.saldo_final_semana.toFixed(2)}</p>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Coluna Rendas */}
                                <div>
                                  <div className="flex justify-between items-center mb-2 border-b pb-1">
                                    <h4 className="font-semibold text-sm">Rendas Lançadas</h4>
                                    {!mes.fechado && (
                                                                            <Dialog>
                                        <DialogTrigger>
                                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs"><PlusCircle className="h-3 w-3 mr-1"/> Nova</Button>
                                        </DialogTrigger>
        <DialogContent className="max-w-md">
                                          <DialogHeader><DialogTitle>Lançar Renda - Semana {semana.numero}</DialogTitle></DialogHeader>
                                          <RendaForm
                                            onSubmit={(data) => handleSubmitRenda(semana.id, data)}
                                            isLoading={false}
                                            dizimistas={dizimistas}
                                            dataInicioSemana={semana.data_inicio}
                                            dataFimSemana={semana.data_fim}
              />
        </DialogContent>
      </Dialog>
                                    )}
    </div>
                                  <ul className="space-y-1 text-sm">
                                    {semana.rendas && semana.rendas.length > 0 ? (
                                      semana.rendas.map((r) => (
                                        <li key={r.id} className="flex justify-between items-center py-1 group">
                                          <div>
                                            <span className="font-medium">{r.tipo}</span>
                                            <span className="text-muted-foreground text-xs block">{r.dizimista_ofertante?.nome || 'Anônimo'} • {r.data_registro}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span>R$ {r.valor.toFixed(2)}</span>
                                            {r.mensagem_enviada_em ? (
                                              <span title="Agradecimento enviado por WhatsApp">
                                                <CheckCheck className="h-4 w-4 text-emerald-400" />
                                              </span>
                                            ) : (
                                              !mes.fechado && user?.funcao !== 'dirigente' && (
                                                <Button variant="ghost" size="icon" title="Agradecer por WhatsApp" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-emerald-400" onClick={() => handleAgradecerRenda(r.id)}>
                                                  <MessageCircle className="h-3 w-3" />
                                                </Button>
                                              )
                                            )}
                                            {!mes.fechado && (
                                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-500" onClick={() => handleRemoverRenda(r.id)}>
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            )}
                                          </div>
                                        </li>
                                      ))
                                    ) : (
                                      <li className="text-muted-foreground text-xs">Nenhuma renda</li>
                                    )}
                                  </ul>
                                </div>

                                {/* Coluna Despesas */}
                                <div>
                                  <div className="flex justify-between items-center mb-2 border-b pb-1">
                                    <h4 className="font-semibold text-sm">Despesas Lançadas</h4>
                                    {!mes.fechado && (
                                      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => {
                                        setSelectedSemanaForDespesa({mesId: mes.id, semanaNum: semana.numero, dataIni: semana.data_inicio, dataFim: semana.data_fim});
                                        setIsDespesaModalOpen(true);
                                      }}>
                                        <PlusCircle className="h-3 w-3 mr-1"/> Nova
                                      </Button>
                                    )}
                                  </div>
                                  <ul className="space-y-1 text-sm">
                                    {semana.despesas && semana.despesas.length > 0 ? (
                                      semana.despesas.map((d) => (
                                        <li key={d.id} className="flex justify-between items-center py-1 group">
                                          <div>
                                            <span className="font-medium">{d.descricao}</span>
                                            {d.data_registro && <span className="text-muted-foreground text-xs block">{d.data_registro}</span>}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span>R$ {d.valor.toFixed(2)}</span>
                                            {!mes.fechado && (
                                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-500" onClick={() => handleRemoverDespesa(d.id)}>
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            )}
                                          </div>
                                        </li>
                                      ))
                                    ) : (
                                      <li className="text-muted-foreground text-xs">Nenhuma despesa</li>
                                    )}
                                  </ul>
                                </div>
                                </div>

                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" onClick={() => handleDownloadPlanilhaSemana(semana.id, semana.numero)}>
                                    <FileSpreadsheet className="h-4 w-4 mr-2" /> Planilha da semana (XLSX)
                                  </Button>
                                  {!mes.fechado && user?.funcao !== 'dirigente' && (
                                    <Button variant="outline" size="sm" onClick={() => handleAgradecerSemana(semana.id)} disabled={isProcessing}>
                                      <MessageCircle className="h-4 w-4 mr-2" /> Agradecer todos (WhatsApp)
                                    </Button>
                                  )}
                                </div>

                                <RecibosSemana
                                  semanaId={semana.id}
                                  semanaNumero={semana.numero}
                                  dataInicio={semana.data_inicio}
                                  dataFim={semana.data_fim}
                                  dizimistas={dizimistas}
                                  mesFechado={mes.fechado || user?.funcao === 'dirigente'}
                                  onLancado={recarregarMeses}
                                />

                              </CardContent>
                            </Card>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Nenhuma semana lançada neste mês.</p>
                        )}

                        {!mes.fechado && mes.semanas && mes.semanas.length < 5 && (
                          <Button variant="outline" className="w-full border-dashed" onClick={() => handleNovaSemana(mes.id, mes.semanas.length + 1)}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Adicionar Semana {mes.semanas ? mes.semanas.length + 1 : 1}
                          </Button>
                        )}
                      </div>

                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
      {/* Renderização condicional do painel de análise de mês */}
      {mesIdParaAnalise && (
        <div className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Análise do Mês</CardTitle>
              <Button variant="ghost" size="sm" onClick={fecharAnalise}>Fechar</Button>
            </CardHeader>
            <CardContent>
              <AnaliseMes
                mesId={mesIdParaAnalise}
                nomeMes={meses.find(m => m.id === mesIdParaAnalise)?.nome || ''}
                fechado={meses.find(m => m.id === mesIdParaAnalise)?.fechado || false}
                saldoInicial={meses.find(m => m.id === mesIdParaAnalise)?.saldo_inicial || 0}
                saldoFinal={meses.find(m => m.id === mesIdParaAnalise)?.saldo_final || 0}
              />
            </CardContent>
          </Card>
        </div>
      )}
          <Dialog open={isDespesaModalOpen} onOpenChange={setIsDespesaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lançar Despesa - Semana {selectedSemanaForDespesa?.semanaNum}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitDespesa} className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input required value={despesaDescricao} onChange={e => setDespesaDescricao(e.target.value)} placeholder="Ex: Conta de Luz" />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input required type="number" step="0.01" min="0.01" value={despesaValor} onChange={e => setDespesaValor(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data de Registro (Opcional)</Label>
              <Input
                type="date"
                value={despesaData}
                onChange={e => setDespesaData(e.target.value)}
                min={selectedSemanaForDespesa?.dataIni}
                max={selectedSemanaForDespesa?.dataFim}
              />
              <p className="text-xs text-muted-foreground">Se fornecida, deve estar entre {selectedSemanaForDespesa?.dataIni} e {selectedSemanaForDespesa?.dataFim}</p>
            </div>
            <Button type="submit" className="w-full" disabled={isProcessing}>{isProcessing ? 'Salvando...' : 'Salvar Despesa'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
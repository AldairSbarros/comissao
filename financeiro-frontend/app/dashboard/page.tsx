"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Plus, Wallet, CalendarDays, TrendingUp, Calculator, Trash2, FileText, Printer
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { useAuth } from "@/hooks/useAuth";
import {
    listarMeses,
    criarMes,
    getSemanasDoMes,
    adicionarSemana,
    adicionarDespesa,
    removerDespesa,
    getBalancete // Importar a função getBalancete para o modal
} from "@/lib/api";
import { Mes, Semana } from "@/lib/types";

// Interface para o Balancete, conforme definido no backend
interface Balancete { nome_mes: string; saldo_inicial_mes: number; total_entradas: number; total_comissao: number; total_despesas: number; saldo_final_consolidado: number; }

export default function DashboardPage() {
    const router = useRouter();
    const { user, isAuthenticated, logout } = useAuth();
    const [meses, setMeses] = useState<Mes[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [selectedMes, setSelectedMes] = useState<Mes | null>(null);
    const [isNewMonthModalOpen, setIsNewMonthModalOpen] = useState(false);
    const [isManageWeekSheetOpen, setIsManageWeekSheetOpen] = useState(false);
    const [isBalanceteModalOpen, setIsBalanceteModalOpen] = useState(false); // Estado para o modal do balancete
    const [newMonthName, setNewMonthName] = useState("");
    const [newMonthSaldoInicial, setNewMonthSaldoInicial] = useState("");
    const [semanasDoMes, setSemanasDoMes] = useState<Semana[]>([]);
    const [balanceteData, setBalanceteData] = useState<Balancete | null>(null); // Estado para os dados do balancete
    const [semanaNumero, setSemanaNumero] = useState(1);
    const [dataInicio, setDataInicio] = useState("");
    const [dataFim, setDataFim] = useState("");
    const [rendaSemanal, setRendaSemanal] = useState("");
    const [semanaParaDespesa, setSemanaParaDespesa] = useState(1);
    const [novaDespesaDesc, setNovaDespesaDesc] = useState("");
    const [novaDespesaValor, setNovaDespesaValor] = useState("");
    const [isCreatingMonth, setIsCreatingMonth] = useState(false);
    const [isSubmittingWeek, setIsSubmittingWeek] = useState(false);
    const [isSubmittingDespesa, setIsSubmittingDespesa] = useState(false);

    useEffect(() => {
        if (isAuthenticated === false) {
            router.push("/");
        }
        if (isAuthenticated === true && user?.congregacao_id) {
            loadMesesData(user.congregacao_id);
        }
    }, [isAuthenticated, user, router]);

    async function loadMesesData(congregacaoId: number) {
        setIsLoadingData(true);
        try {
            const mesesData = await listarMeses(congregacaoId);
            setMeses(mesesData);
        } catch (error) { toast.error("Falha ao carregar meses."); }
        finally { setIsLoadingData(false); }
    }
    
    const handleAction = async (
        action: () => Promise<any>,
        successMessage: string,
        onSuccess?: (result: any) => void
    ) => {
        try {
            const result = await action();
            toast.success(successMessage);
            if (onSuccess) {
                onSuccess(result);
            } else {
                // Ao invés de refreshAllData, vamos ser mais específicos.
                // Re-carregar os meses para atualizar os saldos no card, e as semanas se o sheet estiver aberto.
                if (user?.congregacao_id) {
                    const updatedMeses = await listarMeses(user.congregacao_id);
                    setMeses(updatedMeses);
                    // Se um mês estava selecionado no sheet, atualiza ele também
                    if (selectedMes) {
                        const updatedSelectedMes = updatedMeses.find(m => m.id === selectedMes.id);
                        if (updatedSelectedMes) {
                            setSelectedMes(updatedSelectedMes);
                            await loadSemanasData(updatedSelectedMes.id);
                        }
                    }
                }
            }
        } catch (error: any) { toast.error(error.message || "Ocorreu um erro."); }
    };
    
    async function refreshAllData() { // Mantido, mas o handleAction usa uma lógica mais granular agora
        if (user?.congregacao_id) await loadMesesData(user.congregacao_id);
        if (selectedMes) await loadSemanasData(selectedMes.id);
    };

    async function handleCreateMonth(e: React.FormEvent) {
        e.preventDefault();
        if (!newMonthName.trim() || !user?.congregacao_id) return;
        const saldoInicialFloat = parseFloat(newMonthSaldoInicial.replace(',', '.')) || 0;

        setIsCreatingMonth(true);
        await handleAction(
            () => criarMes({
                nome: newMonthName,
                congregacao_id: user.congregacao_id,
                saldo_inicial: saldoInicialFloat
            }),
            `Mês "${newMonthName}" aberto!`,
            (novoMes) => {
                setMeses([novoMes, ...meses]); // Atualização otimista
            }
        );
        setIsNewMonthModalOpen(false);
        setNewMonthName("");
        setNewMonthSaldoInicial("");
        setIsCreatingMonth(false);
    }
    
    async function openManageWeekSheet(mes: Mes) {
        setSelectedMes(mes);
        setIsManageWeekSheetOpen(true);
        await loadSemanasData(mes.id);
    }
    
    async function loadSemanasData(mesId: number) {
        try {
            const semanasData = await getSemanasDoMes(mesId);
            setSemanasDoMes(semanasData);
            const proximaSemana = semanasData.length > 0 ? Math.max(...semanasData.map((s: Semana) => s.numero)) + 1 : 1;
            setSemanaNumero(proximaSemana);
            // CORREÇÃO: se não houver semanas, a semanaParaDespesa deve ser 1
            if (semanasData.length > 0) {
                setSemanaParaDespesa(semanasData[semanasData.length -1].numero);
            } else {
                setSemanaParaDespesa(1);
            }
        } catch (error) { toast.error("Falha ao carregar lançamentos."); }
    }

    async function handleSubmitNewWeek(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedMes) return;
        const rendaFloat = parseFloat(rendaSemanal.replace(',', '.')) || 0;
        setIsSubmittingWeek(true);
        const semanaData = { numero: semanaNumero, data_inicio: dataInicio, data_fim: dataFim, renda_semanal: rendaFloat, despesas: [] };
        await handleAction(() => adicionarSemana(selectedMes.id, semanaData), `Semana ${semanaNumero} registrada!`);
        setDataInicio(""); setDataFim(""); setRendaSemanal(""); setIsSubmittingWeek(false);
    }
    
    async function handleAddDespesa(e: React.FormEvent) {
        e.preventDefault();
        const valorFloat = parseFloat(novaDespesaValor.replace(',', '.'));
        if (!selectedMes || !novaDespesaDesc.trim() || !valorFloat || valorFloat <= 0) { toast.warning("Preencha a despesa corretamente."); return; }
        setIsSubmittingDespesa(true);
        // O onSuccess aqui é importante para recalcular o mês e a semana no frontend
        await handleAction(
            () => adicionarDespesa(selectedMes.id, semanaParaDespesa, { descricao: novaDespesaDesc, valor: valorFloat }), 
            "Despesa adicionada!"
        );
        setNovaDespesaDesc(""); setNovaDespesaValor(""); setIsSubmittingDespesa(false);
    }

    async function handleRemoveDespesa(despesaId: number) {
        if (!confirm("Remover este lançamento?")) return;
        await handleAction(() => removerDespesa(despesaId), "Despesa removida.");
    }
    
    // MUDANÇA: Função para abrir o modal do balancete e carregar os dados
    async function handleOpenBalanceteModal(mes: Mes) {
        setSelectedMes(mes); // Define o mês selecionado para o balancete
        setIsBalanceteModalOpen(true);
        try {
            const data = await getBalancete(mes.id);
            setBalanceteData(data);
        } catch (error: any) {
            toast.error(error.message || "Erro ao gerar balancete.");
        }
    }

    // MUDANÇA: Função para download do PDF (agora dentro do modal)
    const handleDownloadPdf = async () => {
        if (!selectedMes) {
            toast.error("Nenhum mês selecionado para baixar o PDF.");
            return;
        }
        try {
            const response = await fetch(`http://localhost:8000/meses/${selectedMes.id}/balancete/pdf`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Falha ao gerar o PDF.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `balancete_${selectedMes.nome.replace('/', '-')}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success("Download do balancete iniciado.");

        } catch (error: any) {
            toast.error(error.message || "Erro ao fazer download do PDF.");
        }
    };


    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    if (isLoadingData || isAuthenticated === null || !user) {
        return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><div className="flex flex-col items-center gap-4 text-slate-400 animate-pulse"><Wallet className="w-12 h-12 text-emerald-500/50" /><p>Carregando painel...</p></div></div>;
    }

    return (
        <div className="flex min-h-screen flex-col bg-[#0B0F19] text-white p-6 md:p-10 font-sans">
            <div className="mx-auto w-full max-w-6xl">
                <header className="flex flex-col md:flex-row md:justify-between md:items-center mb-10 pb-6 border-b border-slate-800/60 gap-4">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3"><div className="p-2 bg-emerald-500/10 rounded-lg"><Wallet className="w-7 h-7 text-emerald-400" /></div>Painel Financeiro</h1>
                        <p className="text-sm text-slate-400 font-medium">Gestão de caixa da congregação</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex flex-col items-end text-sm"><span className="font-semibold text-slate-200">{user.email}</span><span className="text-emerald-400 font-medium tracking-wide uppercase text-xs">{user.funcao}</span></div>
                        <Button onClick={logout} variant="outline" className="border-slate-700 hover:bg-slate-800 hover:text-white transition-colors">Sair</Button>
                    </div>
                </header>

                <main className="space-y-8">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                        <div className="flex items-center gap-3"><CalendarDays className="w-5 h-5 text-sky-400" /><h2 className="text-xl font-semibold text-slate-100">Períodos de Apuração</h2></div>
                        <Button onClick={() => setIsNewMonthModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 transition-all active:scale-95 w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" />Abrir Novo Mês</Button>
                    </div>

                    {meses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-slate-700 bg-slate-900/20 text-slate-400">
                          <div className="p-4 bg-slate-800/50 rounded-full mb-4"><CalendarDays className="w-8 h-8 text-slate-500" /></div>
                          <p className="text-lg font-medium text-slate-300">Nenhum mês registrado</p>
                          <p className="text-sm mt-1">Abra o primeiro mês financeiro para começar os lançamentos.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {meses.map((mes, index) => (
                                <Card key={mes.id} className={`relative overflow-hidden border-slate-800 bg-[#131927] transition-all duration-300 hover:border-slate-600 hover:shadow-xl hover:shadow-black/40 group ${index === 0 ? 'ring-1 ring-emerald-500/30' : ''}`}>
                                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-600/50 to-transparent group-hover:via-emerald-500/50 transition-colors" />
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start">
                                            <div><CardTitle className="text-xl font-bold text-slate-100 capitalize">{mes.nome}</CardTitle><CardDescription className="text-slate-500 mt-1 font-mono text-xs">Ref ID: #{mes.id}</CardDescription></div>
                                            {index === 0 && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Ativo</Badge>}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pb-6">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/80 border border-slate-800/80"><span className="text-sm font-medium text-slate-400">Saldo Anterior</span><span className="font-mono text-sm text-slate-300">{formatCurrency(mes.saldo_inicial)}</span></div>
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/30">
                                                <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /><span className="text-sm font-medium text-emerald-500/90">Saldo em Caixa</span></div>
                                                <span className="font-mono font-bold text-lg text-emerald-400">{formatCurrency(mes.saldo_final)}</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="flex gap-2 pt-4 border-t border-slate-800/60 bg-slate-900/30">
                                        <Button variant="outline" size="sm" className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => openManageWeekSheet(mes)}><FileText className="w-4 h-4 mr-2" />Lançamentos</Button>
                                        <Button size="sm" className="flex-1 bg-slate-800 text-slate-200 hover:bg-slate-700" onClick={() => handleOpenBalanceteModal(mes)}><Calculator className="w-4 h-4 mr-2" />Balancete</Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </main>
            </div>

            <Dialog open={isNewMonthModalOpen} onOpenChange={setIsNewMonthModalOpen}>
                <DialogContent className="sm:max-w-[425px] bg-[#0B0F19] border-slate-800 text-slate-200">
                    <form onSubmit={handleCreateMonth}>
                        <DialogHeader>
                            <DialogTitle className="text-xl text-white">Abrir Novo Mês</DialogTitle>
                            <DialogDescription className="text-slate-400">
                                O saldo do mês anterior será usado automaticamente. 
                                Preencha o saldo inicial apenas se este for o primeiro lançamento no sistema.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-6">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="monthName" className="text-right text-slate-300">Nome</Label>
                                <Input id="monthName" value={newMonthName} onChange={e => setNewMonthName(e.target.value)} required className="col-span-3 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500" />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="saldoInicial" className="text-right text-slate-300">Saldo Inicial</Label>
                                <Input 
                                    id="saldoInicial" 
                                    value={newMonthSaldoInicial} 
                                    onChange={e => setNewMonthSaldoInicial(e.target.value)} 
                                    placeholder="0,00" 
                                    className="col-span-3 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-emerald-500" 
                                />
                            </div>
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button type="button" variant="outline" className="border-slate-700 hover:bg-slate-800" onClick={() => setIsNewMonthModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={isCreatingMonth}>{isCreatingMonth ? "Criando..." : "Criar Mês"}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            
            <Sheet open={isManageWeekSheetOpen} onOpenChange={setIsManageWeekSheetOpen}>
                <SheetContent className="bg-[#0B0F19] border-slate-800 w-full sm:max-w-lg overflow-hidden flex flex-col p-0">
                    <SheetHeader className="p-6 pb-4 border-b border-slate-800/60 bg-slate-900/50">
                        <SheetTitle className="text-white text-xl">Lançamentos do Mês</SheetTitle>
                        <SheetDescription className="text-slate-400">Gerencie as finanças de <span className="font-semibold text-slate-300">{selectedMes?.nome}</span></SheetDescription>
                    </SheetHeader>
                    <Tabs defaultValue="overview" className="flex-1 flex flex-col">
                        <div className="px-6 pt-4">
                            <TabsList className="grid w-full grid-cols-3 bg-slate-900 border border-slate-800 rounded-lg p-1">
                                <TabsTrigger value="overview" className="text-xs text-slate-400 data-[state=active]:bg-[#131927] data-[state=active]:text-white">Relatório</TabsTrigger>
                                <TabsTrigger value="renda" className="text-xs text-slate-400 data-[state=active]:bg-[#131927] data-[state=active]:text-white">Nova Renda</TabsTrigger>
                                <TabsTrigger value="despesas" className="text-xs text-slate-400 data-[state=active]:bg-[#131927] data-[state=active]:text-white">Nova Despesa</TabsTrigger>
                            </TabsList>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-6">
                                <TabsContent value="overview">
                                    <Accordion type="single" collapsible className="w-full">
                                        {semanasDoMes.map(sem => (
                                            <AccordionItem value={`semana-${sem.numero}`} key={sem.id} className="border-slate-800">
                                                <AccordionTrigger className="text-slate-200 hover:text-white group">
                                                    <div className="flex flex-col sm:flex-row justify-between w-full pr-4 text-left gap-1">
                                                        <div>
                                                            <span className="font-semibold block">Semana {sem.numero}</span>
                                                            {(sem.data_inicio || sem.data_fim) && (<span className="text-[10px] text-slate-500 font-mono tracking-wide">{sem.data_inicio?.split('-').reverse().join('/')} até {sem.data_fim?.split('-').reverse().join('/')}</span>)}
                                                        </div>
                                                        <span className="text-emerald-400 font-mono text-xs mt-1 sm:mt-0">{formatCurrency(sem.renda_semanal)}</span>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="text-slate-400 space-y-3 pb-4">
                                                    <div className="bg-slate-900 p-2 rounded border border-slate-800 text-xs"><span className="block text-slate-500 mb-1">Comissão Recebida (33%)</span><span className="text-emerald-400 font-mono">{formatCurrency(sem.comissao)}</span></div>
                                                    <Separator className="my-2 bg-slate-800" />
                                                    <h4 className="font-semibold text-xs text-slate-300">Despesas Lançadas</h4>
                                                    {sem.despesas.length > 0 ? sem.despesas.map(d => (
                                                        <div key={d.id} className="flex justify-between items-center text-sm py-1 border-b border-slate-800/50">
                                                            <span>{d.descricao}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-xs text-rose-400">{formatCurrency(d.valor)}</span>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveDespesa(d.id)}><Trash2 className="w-3 h-3 text-slate-500 hover:text-red-500" /></Button>
                                                            </div>
                                                        </div>
                                                    )) : <p className="text-xs text-slate-500 italic">Nenhuma despesa para esta semana.</p>}
                                                </AccordionContent>
                                            </AccordionItem>
                                        ))}
                                    </Accordion>
                                </TabsContent>
                                <TabsContent value="renda">
                                    <form onSubmit={handleSubmitNewWeek} className="space-y-4">
                                        <div><Label className="text-xs text-slate-400">Semana Nº</Label><Input type="number" value={semanaNumero} onChange={e => setSemanaNumero(Number(e.target.value))} className="bg-slate-900 border-slate-700 text-white"/></div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><Label className="text-xs text-slate-400">Data Início</Label><Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="bg-slate-900 border-slate-700 text-white"/></div>
                                            <div><Label className="text-xs text-slate-400">Data Fim</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="bg-slate-900 border-slate-700 text-white"/></div>
                                        </div>
                                        <div><Label className="text-xs text-slate-400">Renda Bruta Semanal</Label><Input value={rendaSemanal} onChange={e => setRendaSemanal(e.target.value)} placeholder="0,00" className="bg-slate-900 border-slate-700 text-white"/></div>
                                        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white" disabled={isSubmittingWeek}>{isSubmittingWeek ? "Registrando..." : "Registrar Renda"}</Button>
                                    </form>
                                </TabsContent>
                                <TabsContent value="despesas">
                                    <form onSubmit={handleAddDespesa} className="space-y-4">
                                        <div>
                                            <Label className="text-xs text-slate-400">Adicionar na Semana Nº</Label>
                                            <select value={semanaParaDespesa} onChange={e => setSemanaParaDespesa(Number(e.target.value))} className="w-full bg-slate-900 border-slate-700 p-2 rounded mt-1 text-sm text-white">
                                                <option disabled>Selecione</option>
                                                {semanasDoMes.map(s => <option key={s.id} value={s.numero}>Semana {s.numero}</option>)}
                                            </select>
                                        </div>
                                        <div><Label className="text-xs text-slate-400">Descrição da Despesa</Label><Input value={novaDespesaDesc} onChange={e => setNovaDespesaDesc(e.target.value)} className="bg-slate-900 border-slate-700 text-white"/></div>
                                        <div><Label className="text-xs text-slate-400">Valor (R$)</Label><Input value={novaDespesaValor} onChange={e => setNovaDespesaValor(e.target.value)} placeholder="0,00" className="bg-slate-900 border-slate-700 text-white"/></div>
                                        <Button type="submit" className="w-full bg-rose-600 hover:bg-rose-500 text-white" disabled={isSubmittingDespesa}>{isSubmittingDespesa ? "Adicionando..." : "Adicionar Despesa"}</Button>
                                    </form>
                                </TabsContent>
                            </div>
                        </ScrollArea>
                    </Tabs>
                </SheetContent>
            </Sheet>

            {/* INÍCIO DO MODAL DE BALANCETE RESTAURADO */}
            <Dialog open={isBalanceteModalOpen} onOpenChange={setIsBalanceteModalOpen}>
                <DialogContent className="max-w-2xl bg-[#0B0F19] border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Balancete Mensal</DialogTitle>
                        <DialogDescription className="text-slate-400">Resumo financeiro de {selectedMes?.nome}</DialogDescription>
                    </DialogHeader>
                    <div id="printable-balancete" className="printable-content bg-white text-black p-6 rounded-md">
                        {balanceteData && (
                            <div className="space-y-4">
                                <div className="text-center pb-4 border-b border-slate-200">
                                    <h2 className="text-lg font-bold">Balancete Mensal - {balanceteData.nome_mes}</h2>
                                    <p className="text-sm text-slate-600">Igreja Evangélica Fictícia</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div><p className="text-slate-500">Saldo do Mês Anterior:</p><p className="font-semibold">{formatCurrency(balanceteData.saldo_inicial_mes)}</p></div>
                                    <div><p className="text-slate-500">Total de Entradas Brutas:</p><p className="font-semibold">{formatCurrency(balanceteData.total_entradas)}</p></div>
                                    <div className="col-span-2 sm:col-span-1"><p className="text-slate-500">(+) Comissão p/ Caixa (33%):</p><p className="font-semibold text-green-600">{formatCurrency(balanceteData.total_comissao)}</p></div>
                                    <div className="col-span-2 sm:col-span-1"><p className="text-slate-500">(-) Total de Despesas:</p><p className="font-semibold text-red-600">-{formatCurrency(balanceteData.total_despesas)}</p></div>
                                </div>
                                <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                                    <span className="font-bold text-base">SALDO FINAL EM CAIXA:</span>
                                    <span className="font-bold text-xl">{formatCurrency(balanceteData.saldo_final_consolidado)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="mt-4 gap-2">
                        <Button variant="outline" className="border-slate-700 hover:bg-slate-800" onClick={() => setIsBalanceteModalOpen(false)}>Fechar</Button>
                        {/* BOTÃO DE DOWNLOAD PDF AGORA DENTRO DO MODAL */}
                        <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => handleDownloadPdf(selectedMes!.id, selectedMes!.nome)}><Printer className="w-4 h-4 mr-2" />Baixar PDF</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* FIM DO MODAL DE BALANCETE RESTAURADO */}
        </div>
    );
}
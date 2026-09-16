"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Wallet, CalendarDays, TrendingUp, Calculator, Trash2, FileText, Printer } from "lucide-react";
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
import { api, getBalancetePdfUrl } from "@/lib/api";
import { Mes, Semana, DespesaCreateData } from "@/lib/types";

export default function DashboardPage() {
    const router = useRouter();
    const { user, loading: authLoading, logout } = useAuth();
    const [meses, setMeses] = useState<Mes[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [selectedMes, setSelectedMes] = useState<Mes | null>(null);
    const [isNewMonthModalOpen, setIsNewMonthModalOpen] = useState(false);
    const [isManageWeekSheetOpen, setIsManageWeekSheetOpen] = useState(false);
    const [isBalanceteModalOpen, setIsBalanceteModalOpen] = useState(false);
    const [newMonthName, setNewMonthName] = useState("");
    const [newMonthSaldoInicial, setNewMonthSaldoInicial] = useState("");
    const [semanasDoMes, setSemanasDoMes] = useState<Semana[]>([]);
    const [balanceteData, setBalanceteData] = useState<any | null>(null);
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

    const loadMesesData = async (congregacaoId: number) => {
        setIsLoadingData(true);
        try {
            const response = await api.get<Mes[]>(`/congregacoes/${congregacaoId}/meses/`);
            setMeses(response.data);
        } catch (error) {
            toast.error("Falha ao carregar meses.");
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push("/");
            } else if (user.is_superuser) {
                router.push("/superuser-dashboard");
            } else if (user.congregacao_id) {
                loadMesesData(user.congregacao_id);
            }
        }
    }, [authLoading, user, router]);

    const refreshData = async () => {
        if (user?.congregacao_id) {
            const updatedMeses = await api.get<Mes[]>(`/congregacoes/${user.congregacao_id}/meses/`);
            setMeses(updatedMeses.data);
            if (selectedMes) {
                const updatedSelectedMes = updatedMeses.data.find(m => m.id === selectedMes.id);
                if (updatedSelectedMes) {
                    setSelectedMes(updatedSelectedMes);
                    await loadSemanasData(updatedSelectedMes.id);
                }
            }
        }
    };
    
    const handleAction = async (action: () => Promise<any>, successMessage: string) => {
        try {
            await action();
            toast.success(successMessage);
            await refreshData();
        } catch (error: any) {
            toast.error(error.response?.data?.detail || error.message || "Ocorreu um erro.");
        }
    };

    const handleCreateMonth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMonthName.trim() || !user?.congregacao_id) return;
        const saldoInicialFloat = parseFloat(newMonthSaldoInicial.replace(',', '.')) || 0;
        setIsCreatingMonth(true);
        await handleAction(
            () => api.post("/meses/", { nome: newMonthName, congregacao_id: user.congregacao_id, saldo_inicial: saldoInicialFloat }),
            `Mês "${newMonthName}" aberto!`
        );
        setIsNewMonthModalOpen(false);
        setNewMonthName("");
        setNewMonthSaldoInicial("");
        setIsCreatingMonth(false);
    };

    const openManageWeekSheet = async (mes: Mes) => {
        setSelectedMes(mes);
        setIsManageWeekSheetOpen(true);
        await loadSemanasData(mes.id);
    };

    const loadSemanasData = async (mesId: number) => {
        try {
            const response = await api.get<Semana[]>(`/meses/${mesId}/semanas/`);
            setSemanasDoMes(response.data);
            const proximaSemana = response.data.length > 0 ? Math.max(...response.data.map(s => s.numero)) + 1 : 1;
            setSemanaNumero(proximaSemana);
            setSemanaParaDespesa(response.data.length > 0 ? response.data[response.data.length - 1].numero : 1);
        } catch (error) {
            toast.error("Falha ao carregar lançamentos.");
        }
    };

    const handleSubmitNewWeek = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMes) return;
        setIsSubmittingWeek(true);
        const semanaData = { numero: semanaNumero, data_inicio: dataInicio, data_fim: dataFim, despesas: [] };
        await handleAction(() => api.post(`/meses/${selectedMes.id}/semanas/`, semanaData), `Semana ${semanaNumero} registrada!`);
        setDataInicio("");
        setDataFim("");
        setIsSubmittingWeek(false);
    };

    const handleAddDespesa = async (e: React.FormEvent) => {
        e.preventDefault();
        const valorFloat = parseFloat(novaDespesaValor.replace(',', '.'));
        if (!selectedMes || !novaDespesaDesc.trim() || !valorFloat || valorFloat <= 0) {
            toast.warning("Preencha a despesa corretamente.");
            return;
        }
        setIsSubmittingDespesa(true);
        const despesaData: DespesaCreateData = { descricao: novaDespesaDesc, valor: valorFloat };
        await handleAction(
            () => api.post(`/meses/${selectedMes.id}/semanas/${semanaParaDespesa}/despesas/`, despesaData),
            "Despesa adicionada!"
        );
        setNovaDespesaDesc("");
        setNovaDespesaValor("");
        setIsSubmittingDespesa(false);
    };

    const handleRemoveDespesa = async (despesaId: number) => {
        if (!confirm("Remover este lançamento?")) return;
        await handleAction(() => api.delete(`/despesas/${despesaId}`), "Despesa removida.");
    };

    const handleOpenBalanceteModal = async (mes: Mes) => {
        setSelectedMes(mes);
        setIsBalanceteModalOpen(true);
                try {
            const response = await api.get<any>(`/meses/${mes.id}/balancete/`);
            setBalanceteData(response.data);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || "Erro ao gerar balancete.");
        }
    };
    
    const handleDownloadPdf = async (mesId: number, nomeMes: string) => {
        try {
          const url = await getBalancetePdfUrl(mesId);
          const a = document.createElement('a');
          a.href = url;
          a.download = `balancete_${nomeMes.replace('/', '-')}.pdf`;
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

    if (authLoading || isLoadingData) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
                <div className="flex flex-col items-center gap-4 text-slate-400 animate-pulse">
                    <Wallet className="w-12 h-12 text-emerald-500/50" />
                    <p>Carregando painel...</p>
                </div>
            </div>
        );
    }
    
    if (!user || !user.congregacao_id) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Acesso de Supervisor</h1>
              <p className="text-slate-400 mt-2">Seu painel de supervisão está em desenvolvimento.</p>
              <Button onClick={logout} variant="outline" className="mt-4 border-slate-700 hover:bg-slate-800 hover:text-white">Sair</Button>
            </div>
          </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-[#0B0F19] text-white p-6 md:p-10 font-sans">
            {/* O resto do seu JSX permanece o mesmo */}
        </div>
    );
}

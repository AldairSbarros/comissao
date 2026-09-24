"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Church, MapPin, Pencil, Plus, Trash2, Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  criarArea, atualizarArea, removerArea, listarAreasPorDenominacao,
  criarCongregacao, atualizarCongregacao, removerCongregacao,
  listarCongregacoesPorDenominacao, getDenominacao,
  listarUsuariosPorDenominacao, criarUsuarioNaDenominacao,
} from "@/lib/api";
import { AreaEclesiastica, Congregacao, Usuario } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// Papéis que podem criar/alterar/remover áreas e congregações.
const PODE_GERENCIAR_AREAS = ["administrador", "supervisor_denominacao"];
const PODE_GERENCIAR_CONGREGACOES = ["administrador", "supervisor_denominacao", "supervisor_area"];

// Rótulos amigáveis para as funções.
const FUNCAO_LABEL: Record<string, string> = {
  administrador: "Administrador",
  supervisor_denominacao: "Supervisor de Denominação",
  supervisor_area: "Supervisor de Área",
  tesoureiro: "Tesoureiro",
};

// Extrai a mensagem de erro detalhada do backend (FastAPI) de um erro do axios.
const detalheErro = (e: unknown): string | undefined =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;

export default function PainelAdministrador() {
  const { user } = useAuth();
  const denominacaoId = user?.denominacao_id;

  const [denominacaoNome, setDenominacaoNome] = useState<string>("");
  const [areas, setAreas] = useState<AreaEclesiastica[]>([]);
  const [congregacoes, setCongregacoes] = useState<Congregacao[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modais
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [areaEmEdicao, setAreaEmEdicao] = useState<AreaEclesiastica | null>(null);
  const [areaNome, setAreaNome] = useState("");

  const [isCongregacaoModalOpen, setIsCongregacaoModalOpen] = useState(false);
  const [congregacaoEmEdicao, setCongregacaoEmEdicao] = useState<Congregacao | null>(null);
  const [congregacaoNome, setCongregacaoNome] = useState("");
  const [congregacaoNumeroCo, setCongregacaoNumeroCo] = useState("");
  const [congregacaoAreaId, setCongregacaoAreaId] = useState<number | "">("");

  // Usuários
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [novoUsuario, setNovoUsuario] = useState({ email: "", password: "", funcao: "tesoureiro", congregacao_id: "" as number | "" });

  const [isSaving, setIsSaving] = useState(false);

  const podeGerenciarAreas = user ? PODE_GERENCIAR_AREAS.includes(user.funcao) : false;
  const podeGerenciarCongregacoes = user ? PODE_GERENCIAR_CONGREGACOES.includes(user.funcao) : false;
  // Quem pode cadastrar usuários da denominação (admin, supervisor de denominação ou de área).
  const podeGerenciarUsuarios = user ? PODE_GERENCIAR_CONGREGACOES.includes(user.funcao) : false;
  // Papéis que o usuário logado pode atribuir.
  const funcoesDisponiveis = (() => {
    if (!user) return [];
    if (user.funcao === "administrador") return ["administrador", "supervisor_denominacao", "supervisor_area", "tesoureiro"];
    if (user.funcao === "supervisor_denominacao") return ["supervisor_area", "tesoureiro"];
    if (user.funcao === "supervisor_area") return ["tesoureiro"];
    return [];
  })();

  const carregarDados = useCallback(async () => {
    if (!denominacaoId) return;
    try {
      const [denom, areasDaApi, congregacoesDaApi, usuariosDaApi] = await Promise.all([
        getDenominacao(denominacaoId).catch(() => null),
        listarAreasPorDenominacao(denominacaoId),
        listarCongregacoesPorDenominacao(denominacaoId),
        listarUsuariosPorDenominacao(denominacaoId).catch(() => [] as Usuario[]),
      ]);
      setDenominacaoNome(denom?.nome ?? "");
      setAreas(areasDaApi);
      setCongregacoes(congregacoesDaApi);
      setUsuarios(usuariosDaApi);
    } catch (error) {
      console.error("Erro ao carregar dados da denominação:", error);
      toast.error("Falha ao carregar os dados da denominação.");
    } finally {
      setIsLoading(false);
    }
  }, [denominacaoId]);

  useEffect(() => {
    if (denominacaoId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch: setState só roda após o await
      carregarDados();
    } else {
      setIsLoading(false);
    }
  }, [denominacaoId, carregarDados]);

  const nomeDaArea = (areaId?: number) => areas.find(a => a.id === areaId)?.nome ?? "Sem área";

  // --- Áreas ---
  const abrirNovaArea = () => {
    setAreaEmEdicao(null);
    setAreaNome("");
    setIsAreaModalOpen(true);
  };

  const abrirEditarArea = (area: AreaEclesiastica) => {
    setAreaEmEdicao(area);
    setAreaNome(area.nome);
    setIsAreaModalOpen(true);
  };

  const handleSalvarArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!denominacaoId || !areaNome.trim() || isSaving) return;
    setIsSaving(true);
    try {
      if (areaEmEdicao) {
        await atualizarArea(areaEmEdicao.id, { nome: areaNome.trim() });
        toast.success(`Área "${areaNome.trim()}" atualizada.`);
      } else {
        await criarArea({ nome: areaNome.trim(), denominacao_id: denominacaoId });
        toast.success(`Área "${areaNome.trim()}" criada.`);
      }
      setIsAreaModalOpen(false);
      await carregarDados();
    } catch (error) {
      toast.error(detalheErro(error) || "Erro ao salvar a área.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoverArea = async (area: AreaEclesiastica) => {
    if (!confirm(`Excluir a área "${area.nome}"? Congregações vinculadas ficarão sem área.`)) return;
    try {
      await removerArea(area.id);
      toast.success(`Área "${area.nome}" excluída.`);
      await carregarDados();
    } catch (error) {
      toast.error(detalheErro(error) || "Erro ao excluir a área.");
    }
  };

  // --- Congregações ---
  const abrirNovaCongregacao = () => {
    setCongregacaoEmEdicao(null);
    setCongregacaoNome("");
    setCongregacaoNumeroCo("");
    // Supervisor de área só pode criar na própria área; nos demais casos, pré-seleciona se houver uma única área.
    const areaPadrao = user?.funcao === "supervisor_area" && user.area_id
      ? user.area_id
      : areas.length === 1 ? areas[0].id : "";
    setCongregacaoAreaId(areaPadrao);
    setIsCongregacaoModalOpen(true);
  };

  const abrirEditarCongregacao = (congregacao: Congregacao) => {
    setCongregacaoEmEdicao(congregacao);
    setCongregacaoNome(congregacao.nome);
    setCongregacaoNumeroCo(congregacao.numero_co ?? "");
    setCongregacaoAreaId(congregacao.area_id ?? "");
    setIsCongregacaoModalOpen(true);
  };

  const handleSalvarCongregacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!denominacaoId || !congregacaoNome.trim() || isSaving) return;
    const payload = {
      nome: congregacaoNome.trim(),
      numero_co: congregacaoNumeroCo.trim() || null,
      area_id: congregacaoAreaId === "" ? null : congregacaoAreaId,
    };
    setIsSaving(true);
    try {
      if (congregacaoEmEdicao) {
        await atualizarCongregacao(congregacaoEmEdicao.id, payload);
        toast.success(`Congregação "${payload.nome}" atualizada.`);
      } else {
        await criarCongregacao({
          nome: payload.nome,
          numero_co: payload.numero_co ?? undefined,
          area_id: payload.area_id ?? undefined,
          denominacao_id: denominacaoId,
        });
        toast.success(`Congregação "${payload.nome}" criada.`);
      }
      setIsCongregacaoModalOpen(false);
      await carregarDados();
    } catch (error) {
      toast.error(detalheErro(error) || "Erro ao salvar a congregação.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoverCongregacao = async (congregacao: Congregacao) => {
    if (!confirm(`Excluir a congregação "${congregacao.nome}" e todos os seus dados financeiros? Esta ação é irreversível.`)) return;
    try {
      await removerCongregacao(congregacao.id);
      toast.success(`Congregação "${congregacao.nome}" excluída.`);
      await carregarDados();
    } catch (error) {
      toast.error(detalheErro(error) || "Erro ao excluir a congregação.");
    }
  };

  // --- Usuários ---
  const abrirNovoUsuario = () => {
    setNovoUsuario({ email: "", password: "", funcao: "tesoureiro", congregacao_id: "" });
    setIsUserModalOpen(true);
  };

  const handleCriarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!denominacaoId || !novoUsuario.email.trim() || !novoUsuario.password || isSaving) return;
    setIsSaving(true);
    try {
      const payload: { email: string; password: string; funcao: string; congregacao_id?: number; area_id?: number } = {
        email: novoUsuario.email.trim(),
        password: novoUsuario.password,
        funcao: novoUsuario.funcao,
      };
      if (novoUsuario.funcao === "tesoureiro") {
        if (novoUsuario.congregacao_id === "") {
          toast.warning("Selecione a congregação do tesoureiro.");
          return;
        }
        payload.congregacao_id = novoUsuario.congregacao_id;
      }
      await criarUsuarioNaDenominacao(denominacaoId, payload);
      toast.success(`Usuário "${payload.email}" criado.`);
      setIsUserModalOpen(false);
      await carregarDados();
    } catch (error) {
      toast.error(detalheErro(error) || "Erro ao criar o usuário.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Carregando painel administrativo...</p>;
  }

  if (!denominacaoId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Sua conta não está vinculada a uma denominação. Fale com o superusuário para ajustar seu cadastro.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Church className="h-6 w-6 text-emerald-500" />
        <h2 className="text-xl font-semibold">
          {denominacaoNome || "Minha Denominação"}
        </h2>
        <Badge variant="outline" className="ml-2 capitalize">{user?.funcao?.replace("_", " ")}</Badge>
      </div>

      {/* Áreas Eclesiásticas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-500" />
              Áreas Eclesiásticas
            </CardTitle>
            <CardDescription>Divisões regionais da denominação.</CardDescription>
          </div>
          {podeGerenciarAreas && (
            <Button size="sm" onClick={abrirNovaArea}>
              <Plus className="h-4 w-4 mr-1" /> Nova Área
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {areas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma área cadastrada.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((area) => (
                <li key={area.id} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                  <span className="text-sm font-medium">{area.nome}</span>
                  {podeGerenciarAreas && (
                    <span className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEditarArea(area)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleRemoverArea(area)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Congregações */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Church className="h-4 w-4 text-emerald-500" />
              Congregações
            </CardTitle>
            <CardDescription>Igrejas locais e seus tesoureiros.</CardDescription>
          </div>
          {podeGerenciarCongregacoes && (
            <Button size="sm" onClick={abrirNovaCongregacao}>
              <Plus className="h-4 w-4 mr-1" /> Nova Congregação
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {congregacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma congregação cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 font-medium">Nome</th>
                    <th className="py-2 pr-4 font-medium">Nº CO</th>
                    <th className="py-2 pr-4 font-medium">Área</th>
                    {podeGerenciarCongregacoes && <th className="py-2 text-right font-medium">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {congregacoes.map((congregacao) => (
                    <tr key={congregacao.id} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-4">{congregacao.nome}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{congregacao.numero_co || "—"}</td>
                      <td className="py-2 pr-4">{congregacao.area_id ? nomeDaArea(congregacao.area_id) : <span className="text-muted-foreground">Sem área</span>}</td>
                      {podeGerenciarCongregacoes && (
                        <td className="py-2 text-right">
                          <span className="inline-flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEditarCongregacao(congregacao)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleRemoverCongregacao(congregacao)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usuários */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              Usuários
            </CardTitle>
            <CardDescription>Equipe da denominação (administradores, supervisores e tesoureiros).</CardDescription>
          </div>
          {podeGerenciarUsuarios && (
            <Button size="sm" onClick={abrirNovoUsuario}>
              <Plus className="h-4 w-4 mr-1" /> Novo Usuário
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {usuarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 font-medium">E-mail</th>
                    <th className="py-2 pr-4 font-medium">Função</th>
                    <th className="py-2 pr-4 font-medium">Vínculo</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{FUNCAO_LABEL[u.funcao] ?? u.funcao}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {u.congregacao_id
                          ? congregacoes.find(c => c.id === u.congregacao_id)?.nome ?? `Congregação #${u.congregacao_id}`
                          : u.area_id
                            ? nomeDaArea(u.area_id)
                            : "Denominação"}
                      </td>
                      <td className="py-2 pr-4">
                        {u.is_active === false ? (
                          <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Suspenso</Badge>
                        ) : (
                          <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Ativo</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Nova/Editar Área */}
      <Dialog open={isAreaModalOpen} onOpenChange={setIsAreaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{areaEmEdicao ? "Editar Área" : "Nova Área Eclesiástica"}</DialogTitle>
            <DialogDescription>
              {areaEmEdicao ? "Altere o nome da área." : "Crie uma nova área para agrupar congregações."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSalvarArea} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="area_nome">Nome da Área *</Label>
              <Input
                id="area_nome"
                value={areaNome}
                onChange={(e) => setAreaNome(e.target.value)}
                placeholder="Ex: Área Norte"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAreaModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Nova/Editar Congregação */}
      <Dialog open={isCongregacaoModalOpen} onOpenChange={setIsCongregacaoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{congregacaoEmEdicao ? "Editar Congregação" : "Nova Congregação"}</DialogTitle>
            <DialogDescription>
              {congregacaoEmEdicao ? "Altere os dados da congregação." : "Cadastre uma nova igreja local."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSalvarCongregacao} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="congregacao_nome">Nome *</Label>
              <Input
                id="congregacao_nome"
                value={congregacaoNome}
                onChange={(e) => setCongregacaoNome(e.target.value)}
                placeholder="Ex: Congregação Central"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="congregacao_co">Número CO (opcional)</Label>
              <Input
                id="congregacao_co"
                value={congregacaoNumeroCo}
                onChange={(e) => setCongregacaoNumeroCo(e.target.value)}
                placeholder="Ex: 001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="congregacao_area">Área (opcional)</Label>
              <select
                id="congregacao_area"
                value={congregacaoAreaId}
                onChange={(e) => setCongregacaoAreaId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full border-input bg-transparent rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Sem área</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.nome}</option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCongregacaoModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Novo Usuário */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>Cadastre um membro da equipe desta denominação.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCriarUsuario} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="usuario_email">E-mail *</Label>
              <Input
                id="usuario_email"
                type="email"
                value={novoUsuario.email}
                onChange={(e) => setNovoUsuario(prev => ({ ...prev, email: e.target.value }))}
                placeholder="usuario@denominacao.com"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usuario_password">Senha *</Label>
              <Input
                id="usuario_password"
                type="password"
                value={novoUsuario.password}
                onChange={(e) => setNovoUsuario(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Senha inicial"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usuario_funcao">Função *</Label>
              <select
                id="usuario_funcao"
                value={novoUsuario.funcao}
                onChange={(e) => setNovoUsuario(prev => ({ ...prev, funcao: e.target.value, congregacao_id: "" }))}
                className="w-full border-input bg-transparent rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {funcoesDisponiveis.map((f) => (
                  <option key={f} value={f}>{FUNCAO_LABEL[f] ?? f}</option>
                ))}
              </select>
            </div>
            {novoUsuario.funcao === "tesoureiro" && (
              <div className="space-y-2">
                <Label htmlFor="usuario_congregacao">Congregação *</Label>
                <select
                  id="usuario_congregacao"
                  value={novoUsuario.congregacao_id}
                  onChange={(e) => setNovoUsuario(prev => ({ ...prev, congregacao_id: e.target.value === "" ? "" : Number(e.target.value) }))}
                  className="w-full border-input bg-transparent rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Selecione a congregação</option>
                  {congregacoes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                {congregacoes.length === 0 && (
                  <p className="text-xs text-muted-foreground">Crie uma congregação antes de cadastrar um tesoureiro.</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsUserModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Criando..." : "Criar Usuário"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, CheckCheck, CheckCircle2, Loader2, RefreshCw, ScanText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  confirmarRecibo,
  confirmarRecibosConferidos,
  excluirRecibo,
  getReciboImagemParUrl,
  getReciboImagemUrl,
  listarRecibos,
  reprocessarOcr,
  uploadRecibos,
} from "@/lib/api";
import { DizimistaOfertante, ReciboPendente, SugestaoOcr } from "@/lib/types";

interface RecibosSemanaProps {
  semanaId: number;
  semanaNumero: number;
  dataInicio: string;
  dataFim: string;
  dizimistas: DizimistaOfertante[];
  mesFechado: boolean;
  onLancado: () => Promise<void>;
}

function parseSugestao(sugestao: string | null | undefined): SugestaoOcr | null {
  if (!sugestao) return null;
  try {
    return JSON.parse(sugestao) as SugestaoOcr;
  } catch {
    return null;
  }
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function pareceDescricaoCulto(nome: string | null | undefined): boolean {
  if (!nome) return false;
  return /\b(culto|oferta|miss[aã]o|campanha|celebra[cç][aã]o|doutrina|ora[cç][aã]o)\b/i.test(nome);
}

function encontrarDizimistaPorNome(
  nome: string | null | undefined,
  lista: DizimistaOfertante[],
  idSugerido?: number | null
): DizimistaOfertante | null {
  if (idSugerido != null) {
    const porId = lista.find((d) => d.id === idSugerido);
    if (porId) return porId;
  }
  if (!nome || !nome.trim() || pareceDescricaoCulto(nome)) return null;
  const chave = normalizarTexto(nome);
  if (!chave) return null;

  const exato = lista.find((d) => normalizarTexto(d.nome) === chave);
  if (exato) return exato;

  const tokensBusca = chave.split(" ").filter(Boolean);
  if (tokensBusca.some((t) => t.length >= 4)) {
    const correspondentes = lista.filter((d) => {
      const tokensCand = normalizarTexto(d.nome).split(" ").filter(Boolean);
      let idx = 0;
      for (const t of tokensBusca) {
        while (idx < tokensCand.length && tokensCand[idx] !== t) idx += 1;
        if (idx >= tokensCand.length) return false;
        idx += 1;
      }
      return true;
    });
    if (tokensBusca.length >= 2 && correspondentes.length > 0) return correspondentes[0];
    if (tokensBusca.length === 1 && correspondentes.length === 1) return correspondentes[0];
  }
  return null;
}

export default function RecibosSemana({
  semanaId,
  semanaNumero,
  dataInicio,
  dataFim,
  dizimistas,
  mesFechado,
  onLancado,
}: RecibosSemanaProps) {
  const [pendentes, setPendentes] = useState<ReciboPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [selecionado, setSelecionado] = useState<ReciboPendente | null>(null);
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const [imagemParUrl, setImagemParUrl] = useState<string | null>(null);
  const [carregandoImagem, setCarregandoImagem] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [confirmandoConferidos, setConfirmandoConferidos] = useState(false);
  const [rodandoOcr, setRodandoOcr] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef(0);

  // Form da conferência.
  const [tipo, setTipo] = useState("Dízimo");
  const [valor, setValor] = useState("");
  const [dataRegistro, setDataRegistro] = useState("");
  const [numeroRecibo, setNumeroRecibo] = useState("");
  const [dizimistaId, setDizimistaId] = useState("none");
  const [dizimistaNome, setDizimistaNome] = useState("");
  const [metodoPagamento, setMetodoPagamento] = useState("Espécie");
  const [observacao, setObservacao] = useState("");

  const recarregar = useCallback(async () => {
    try {
      const lista = await listarRecibos(semanaId, "pendente");
      setPendentes(lista);
      return lista;
    } catch {
      toast.error("Falha ao carregar recibos pendentes.");
      return [];
    } finally {
      setCarregando(false);
    }
  }, [semanaId]);

  useEffect(() => {
    async function carregarInicial() {
      await recarregar();
    }
    carregarInicial();
  }, [recarregar]);

  // Após o upload, consulta periodicamente até o OCR terminar (ou desistir).
  useEffect(() => {
    const aguardandoOcr = pendentes.some((p) => !p.sugestao_ocr && !p.ocr_erro);
    if (!aguardandoOcr || pollRef.current >= 24) return;
    const timer = setTimeout(async () => {
      pollRef.current += 1;
      await recarregar();
    }, 5000);
    return () => clearTimeout(timer);
  }, [pendentes, recarregar]);

  // Libera as URLs das imagens ao trocar/fechar.
  useEffect(() => {
    return () => {
      if (imagemUrl) URL.revokeObjectURL(imagemUrl);
    };
  }, [imagemUrl]);

  useEffect(() => {
    return () => {
      if (imagemParUrl) URL.revokeObjectURL(imagemParUrl);
    };
  }, [imagemParUrl]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setEnviando(true);
    try {
      const criados = await uploadRecibos(semanaId, files);
      pollRef.current = 0;
      toast.success(`${criados.length} recibo(s) enviado(s). Confira um por um abaixo.`);
      await recarregar();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar recibos.";
      const detalhe = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detalhe || msg);
    } finally {
      setEnviando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const aplicarSugestaoNoFormulario = (sug: SugestaoOcr | null, limparAntes: boolean) => {
    const tipoSugerido = sug?.tipo === "Dízimo" || sug?.tipo === "Oferta" ? sug.tipo : "Dízimo";
    if (limparAntes) {
      setTipo(tipoSugerido);
      setValor(sug?.valor != null ? String(sug.valor) : "");
      setDataRegistro(sug?.data || "");
      setNumeroRecibo(sug?.numero_recibo || "");
      setMetodoPagamento("Espécie");
      setObservacao("");
    } else {
      if (sug?.tipo === "Dízimo" || sug?.tipo === "Oferta") setTipo(sug.tipo);
      if (sug?.valor != null) setValor(String(sug.valor));
      if (sug?.data) setDataRegistro(sug.data);
      if (sug?.numero_recibo) setNumeroRecibo(sug.numero_recibo);
    }

    if (tipoSugerido === "Oferta" && pareceDescricaoCulto(sug?.nome)) {
      setObservacao(sug?.nome || "");
      setDizimistaId("none");
      setDizimistaNome("");
      return;
    }

    const encontrado = encontrarDizimistaPorNome(sug?.nome, dizimistas, sug?.dizimista_id);
    if (encontrado) {
      setDizimistaId(String(encontrado.id));
      setDizimistaNome(encontrado.nome);
    } else if (limparAntes || sug?.nome) {
      setDizimistaId("none");
      setDizimistaNome(sug?.nome || "");
    }
  };

  const abrirConferencia = async (recibo: ReciboPendente) => {
    setSelecionado(recibo);
    setCarregandoImagem(true);
    setImagemUrl(null);
    setImagemParUrl(null);
    // Pré-preenche com a sugestão do OCR (quando houver).
    aplicarSugestaoNoFormulario(parseSugestao(recibo.sugestao_ocr), true);
    try {
      const [url, urlPar] = await Promise.all([
        getReciboImagemUrl(recibo.id),
        recibo.arquivo_par ? getReciboImagemParUrl(recibo.id).catch(() => null) : Promise.resolve(null),
      ]);
      setImagemUrl(url);
      setImagemParUrl(urlPar);
    } catch {
      toast.error("Falha ao carregar a imagem do recibo.");
    } finally {
      setCarregandoImagem(false);
    }
  };

  const fecharConferencia = () => {
    setSelecionado(null);
    if (imagemUrl) URL.revokeObjectURL(imagemUrl);
    if (imagemParUrl) URL.revokeObjectURL(imagemParUrl);
    setImagemUrl(null);
    setImagemParUrl(null);
  };

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selecionado) return;
    const valorNum = parseFloat(valor);
    if (!valorNum || valorNum <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (!dataRegistro) {
      toast.error("Informe a data do recibo.");
      return;
    }
    setConfirmando(true);
    try {
      await confirmarRecibo(selecionado.id, {
        tipo,
        valor: valorNum,
        data_registro: dataRegistro,
        numero_recibo: numeroRecibo || undefined,
        observacao: observacao || undefined,
        metodo_pagamento: metodoPagamento,
        dizimista_ofertante_id: dizimistaId !== "none" ? Number(dizimistaId) : undefined,
        dizimista_nome: dizimistaId === "none" && dizimistaNome.trim() ? dizimistaNome.trim() : undefined,
      });
      toast.success("Contribuição lançada!");
      const restantes = await recarregar();
      await onLancado();
      // Avança automaticamente para o próximo pendente.
      const proximo = restantes.find((r) => r.id !== selecionado.id) || null;
      if (proximo) {
        abrirConferencia(proximo);
      } else {
        fecharConferencia();
      }
    } catch (err: unknown) {
      const detalhe = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detalhe || "Erro ao lançar contribuição.");
    } finally {
      setConfirmando(false);
    }
  };

  const handleExcluir = async () => {
    if (!selecionado || !confirm("Descartar este recibo? A imagem será apagada.")) return;
    try {
      await excluirRecibo(selecionado.id);
      toast.success("Recibo descartado.");
      fecharConferencia();
      await recarregar();
    } catch {
      toast.error("Erro ao descartar recibo.");
    }
  };

  const handleRodarOcr = async () => {
    if (!selecionado) return;
    setRodandoOcr(true);
    try {
      const atualizado = await reprocessarOcr(selecionado.id);
      setSelecionado(atualizado);
      const sug = parseSugestao(atualizado.sugestao_ocr);
      if (sug) {
        aplicarSugestaoNoFormulario(sug, false);
        try {
          const [urlAtualizada, urlParAtualizada] = await Promise.all([
            getReciboImagemUrl(atualizado.id),
            atualizado.arquivo_par ? getReciboImagemParUrl(atualizado.id).catch(() => null) : Promise.resolve(null),
          ]);
          setImagemUrl(urlAtualizada);
          setImagemParUrl(urlParAtualizada);
        } catch {
          // Mantem imagem anterior se nao conseguir recarregar.
        }
        toast.success("OCR concluído. Confira os campos.");
      } else if (atualizado.ocr_erro) {
        toast.error(`OCR falhou: ${atualizado.ocr_erro}`);
      }
      await recarregar();
    } catch (err: unknown) {
      const detalhe = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detalhe || "Erro ao rodar OCR.");
    } finally {
      setRodandoOcr(false);
    }
  };

  const handleConfirmarConferidos = async () => {
    setConfirmandoConferidos(true);
    try {
      const res = await confirmarRecibosConferidos(semanaId);
      if (res.confirmados.length > 0) {
        toast.success(`${res.confirmados.length} recibo(s) conferido(s) lançado(s)!`);
      } else {
        toast.info("Nenhum recibo elegível para confirmação em lote.");
      }
      await recarregar();
      await onLancado();
    } catch (err: unknown) {
      const detalhe = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detalhe || "Erro ao confirmar recibos em lote.");
    } finally {
      setConfirmandoConferidos(false);
    }
  };

  const sugAtual = parseSugestao(selecionado?.sugestao_ocr);
  const sugParAtual = parseSugestao(selecionado?.sugestao_par);
  const qtdConferidosOk = pendentes.filter(
    (r) => parseSugestao(r.sugestao_ocr)?.status_conferencia === "conferido_ok"
  ).length;

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Recibos da Semana {semanaNumero}
            {pendentes.length > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
                {pendentes.length} aguardando conferência
              </span>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => recarregar()} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!mesFechado && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              multiple
              onChange={handleUpload}
              disabled={enviando}
              className="text-xs flex-1 min-w-[200px]"
            />
            <Button size="sm" disabled={enviando} onClick={() => fileInputRef.current?.click()}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              {enviando ? "Enviando..." : "Enviar"}
            </Button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleUpload}
              disabled={enviando}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={enviando}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-4 w-4 mr-1" />
              Fotografar 1ª Via (Câmera)
            </Button>
          </div>
        )}
        {!mesFechado && qtdConferidosOk > 0 && (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={confirmandoConferidos}
              onClick={handleConfirmarConferidos}
            >
              {confirmandoConferidos ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCheck className="h-4 w-4 mr-1" />}
              Confirmar todos que conferem ({qtdConferidosOk}) (1ª = 2ª via)
            </Button>
          </div>
        )}
        {carregando ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : pendentes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Nenhum recibo aguardando. Envie o PDF escaneado ou as fotos dos recibos da semana.
          </p>
        ) : (
          <ul className="space-y-1">
            {pendentes.map((r) => {
              const sug = parseSugestao(r.sugestao_ocr);
              const viaLabel =
                sug?.via === "1a_via_branca"
                  ? "1ª Via"
                  : sug?.via === "2a_via_azul"
                    ? "2ª Via"
                    : null;
              return (
                <li key={r.id}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between text-xs gap-2"
                    onClick={() => abrirConferencia(r)}
                  >
                    <span className="truncate">
                      Recibo #{r.id}
                      {r.pagina_origem ? ` (pág. ${r.pagina_origem})` : ""}
                      {sug?.tipo ? ` [${sug.tipo}]` : ""}
                      {sug?.nome ? ` — ${sug.nome}` : ""}
                      {sug?.valor != null ? ` — R$ ${Number(sug.valor).toFixed(2)}` : ""}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                      {sug?.status_conferencia === "conferido_ok" ? (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">
                          1ª e 2ª Vias Conferem
                        </span>
                      ) : sug?.status_conferencia === "divergente" ? (
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[11px] font-medium text-red-400">
                          Divergência 1ª × 2ª Via
                        </span>
                      ) : viaLabel ? (
                        <span className="rounded bg-slate-500/20 px-1.5 py-0.5 text-[11px] text-slate-300">
                          {viaLabel}
                        </span>
                      ) : null}
                      {sug?.divergencia_valor && (
                        <span title="Possível divergência entre número e extenso">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        </span>
                      )}
                      {r.sugestao_ocr ? (
                        <><ScanText className="h-3 w-3 text-emerald-400" /> OCR pronto</>
                      ) : r.ocr_erro ? (
                        <><ScanText className="h-3 w-3 text-red-400" /> digitar manual</>
                      ) : (
                        <><Loader2 className="h-3 w-3 animate-spin" /> lendo...</>
                      )}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <Dialog open={!!selecionado} onOpenChange={(open) => { if (!open) fecharConferencia(); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Conferir recibo #{selecionado?.id}
                {selecionado?.sugestao_ocr && (
                  <span className="ml-2 text-xs font-normal text-emerald-400">campos sugeridos pelo OCR — confira</span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col items-center justify-start bg-black/30 rounded-md p-2 min-h-[300px] gap-3">
                {carregandoImagem ? (
                  <Loader2 className="h-8 w-8 animate-spin my-auto" />
                ) : imagemParUrl ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[11px] font-medium text-slate-300">
                        {sugAtual?.via === "1a_via_branca"
                          ? "1ª Via enviada pelo Tesoureiro"
                          : sugAtual?.via === "2a_via_azul"
                            ? "2ª Via (Escaneada)"
                            : "Via Principal"}
                        {sugAtual?.valor != null ? ` — R$ ${Number(sugAtual.valor).toFixed(2)}` : ""}
                      </span>
                      {imagemUrl && (
                        <img src={imagemUrl} alt="Via principal do recibo" className="max-h-[55vh] object-contain rounded border border-slate-700" />
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[11px] font-medium text-slate-300">
                        {sugParAtual?.via === "2a_via_azul"
                          ? "2ª Via escaneada em Casa"
                          : sugParAtual?.via === "1a_via_branca"
                            ? "1ª Via enviada pelo Tesoureiro"
                            : "Via Pareada"}
                        {sugAtual?.valor_par != null ? ` — R$ ${Number(sugAtual.valor_par).toFixed(2)}` : ""}
                      </span>
                      <img src={imagemParUrl} alt="Via pareada do recibo" className="max-h-[55vh] object-contain rounded border border-slate-700" />
                    </div>
                  </div>
                ) : imagemUrl ? (
                  <img src={imagemUrl} alt="Foto do recibo" className="max-h-[60vh] object-contain rounded" />
                ) : (
                  <p className="text-xs text-muted-foreground my-auto">Imagem indisponível</p>
                )}
                {sugAtual?.status_conferencia === "conferido_ok" && (
                  <div className="w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-300 text-center">
                    1ª e 2ª Vias conferem exatamente no valor (R$ {Number(sugAtual.valor).toFixed(2)}).
                  </div>
                )}
                {sugAtual?.status_conferencia === "divergente" && (
                  <div className="w-full flex items-center justify-center gap-2 rounded-md border border-red-500/50 bg-red-500/15 p-2 text-xs text-red-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>
                      Divergência detectada entre as vias: R$ {Number(sugAtual.valor ?? 0).toFixed(2)} vs R$ {Number(sugAtual.valor_par ?? 0).toFixed(2)}!
                    </span>
                  </div>
                )}
              </div>
              <form onSubmit={handleConfirmar} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Tipo *</Label>
                    <Select value={tipo} onValueChange={(v) => setTipo(v || "Dízimo")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dízimo">Dízimo</SelectItem>
                        <SelectItem value="Oferta">Oferta</SelectItem>
                        <SelectItem value="Oferta de Missões">Oferta de Missões</SelectItem>
                        <SelectItem value="Campanha">Campanha</SelectItem>
                        <SelectItem value="Outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Valor (R$) *</Label>
                    <Input type="number" step="0.01" min="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
                  </div>
                </div>
                {sugAtual?.valor_extenso && (
                  <p className="text-xs text-muted-foreground">
                    Extenso lido: <span className="italic">&ldquo;{sugAtual.valor_extenso}&rdquo;</span>
                  </p>
                )}
                {sugAtual?.divergencia_valor && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>Atenção: o valor numérico pode divergir do valor por extenso. Confira na imagem!</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Data *</Label>
                    <Input type="date" min={dataInicio} max={dataFim} value={dataRegistro} onChange={(e) => setDataRegistro(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Nº Recibo</Label>
                    <Input value={numeroRecibo} onChange={(e) => setNumeroRecibo(e.target.value)} placeholder="Nº impresso no talão" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Contribuinte (selecione ou digite o nome)</Label>
                  <Select value={dizimistaId} onValueChange={(v) => setDizimistaId(v || "none")}>
                    <SelectTrigger><SelectValue placeholder="Vincular a um membro" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Digitar nome abaixo --</SelectItem>
                      {dizimistas.map((d) => (
                        <SelectItem key={d.id} value={d.id.toString()}>{d.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {dizimistaId === "none" && (
                    <Input value={dizimistaNome} onChange={(e) => setDizimistaNome(e.target.value)} placeholder="Nome do contribuinte (cria se não existir)" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Pagamento *</Label>
                    <Select value={metodoPagamento} onValueChange={(v) => setMetodoPagamento(v || "Espécie")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Espécie">Espécie</SelectItem>
                        <SelectItem value="Pix">Pix</SelectItem>
                        <SelectItem value="Transferência">Transferência Bancária</SelectItem>
                        <SelectItem value="Cartão">Cartão de Crédito/Débito</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Observação</Label>
                    <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" className="flex-1" disabled={confirmando || mesFechado}>
                    {confirmando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Confirmar e lançar
                  </Button>
                  <Button type="button" variant="outline" size="icon" title="Rodar OCR novamente" onClick={handleRodarOcr} disabled={rodandoOcr || mesFechado}>
                    {rodandoOcr ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" title="Descartar recibo" onClick={handleExcluir} disabled={mesFechado}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
                {mesFechado && <p className="text-xs text-red-400">Mês fechado: conferência somente leitura.</p>}
              </form>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

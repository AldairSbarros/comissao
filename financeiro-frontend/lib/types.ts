export interface Renda {
  id: number;
  tipo: string;
  valor: number;
  data_registro: string; // no frontend será string YYYY-MM-DD
  numero_recibo?: string;
  observacao?: string;
  metodo_pagamento: string;
  congregacao_id: number;
  semana_id: number;
  dizimista_ofertante_id?: number;
  dizimista_ofertante?: DizimistaOfertante;
}

export interface RendaCreateData {
  tipo: string;
  valor: number;
  data_registro: string;
  numero_recibo?: string;
  observacao?: string;
  metodo_pagamento: string;
  dizimista_ofertante_id?: number;
}

export interface Despesa {
  id: number;
  descricao: string;
  valor: number;
  data_registro?: string;
}

export interface DespesaCreateData {
  descricao: string;
  valor: number;
  data_registro?: string;
}

export interface Semana {
  id: number;
  numero: number;
  data_inicio: string;
  data_fim: string;
  saldo_inicial_semana: number;
  renda_semanal: number;
  comissao: number;
  saldo_final_semana: number;
  despesas: Despesa[];
  rendas: Renda[];
}

export interface Mes {
  id: number;
  nome: string;
  congregacao_id: number;
  saldo_inicial: number;
  saldo_final: number;
  fechado: boolean;
  semanas: Semana[];
}

export interface Usuario {
  id: number;
  email: string;
  funcao: string;
  is_active?: boolean;
  denominacao_id?: number;
  denominacao?: { id: number; nome: string };
  congregacao_id?: number;
}

export interface DizimistaOfertante {
  id: number;
  nome: string;
  email?: string;
  telefone?: string;
  congregacao_id: number;
}

export interface DizimistaOfertanteCreateData {
  nome: string;
  email?: string;
  telefone?: string;
}

export interface DizimistaOfertanteUpdateData {
  nome?: string;
  email?: string;
  telefone?: string;
}

// --- NOVAS INTERFACES PARA CADASTRO ---
export interface Denominacao {
  id: number;
  nome: string;
}

export interface DenominacaoCreateData {
  nome: string;
}

export interface AreaEclesiastica {
  id: number;
  nome: string;
  denominacao_id: number;
}

export interface AreaEclesiasticaCreateData {
  nome: string;
  denominacao_id: number;
}

export interface Congregacao {
  id: number;
  nome: string;
  numero_co?: string;
  denominacao_id: number;
  area_id?: number;
}

export interface CongregacaoCreateData {
  nome: string;
  numero_co?: string;
  denominacao_id: number;
  area_id?: number;
}

export interface UsuarioCreateData {
  email: string;
  password: string;
  funcao: string;
  denominacao_id: number;
  area_id?: number;
  congregacao_id?: number;
}

// --- Schemas de Gestão (Painel Master) ---
export interface UserPasswordReset {
  nova_senha: string;
}

export interface UserStatusUpdate {
  is_active: boolean;
}

export interface TenantRename {
  nome: string;
}

// --- Schemas de Análise de Mês (para gráficos) ---
export interface SemanaResumo {
  numero_semana: number;
  label: string;
  entradas: number;
  saidas: number;
  saldo_acumulado: number;
}

export interface RendaItemResumo {
  tipo: string;
  total: number;
  quantidade: number;
}

export interface MetodoPagamentoResumo {
  metodo_pagamento: string;
  total: number;
  quantidade: number;
}

export interface AnaliseMes {
  mes_id: number;
  nome_mes: string;
  series_entradas_saida: SemanaResumo[];
  principais_rendas: RendaItemResumo[];
  resumo_pagamentos: MetodoPagamentoResumo[];
  totais: {
    saldo_inicial: number;
    entradas_brutas: number;
    comissao: number;
    despesas: number;
    saldo_final: number;
    taxa_comissao: number;
    semanas_lancadas: number;
    rendas_total: number;
    despesas_total: number;
  };
}


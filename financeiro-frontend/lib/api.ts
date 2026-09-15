import { Despesa, DespesaCreateData, Mes, Semana, Usuario, Denominacao, DenominacaoCreateData, AreaEclesiastica, AreaEclesiasticaCreateData, Congregacao, CongregacaoCreateData, UsuarioCreateData, DizimistaOfertante, DizimistaOfertanteCreateData, DizimistaOfertanteUpdateData, Renda, RendaCreateData, AnaliseMes } from "./types";
import { MasterStats, SetupPayload, DenominacaoStatusUpdate } from "@/lib/schemas"; // Importar os novos schemas

// A URL base da API será determinada pela variável de ambiente NEXT_PUBLIC_API_URL.
// Em desenvolvimento (local), geralmente aponta para http://localhost:8001 (porta mapeada do backend Docker).
// Em produção, será o caminho relativo configurado no Nginx/OpenResty, ex: /financeiro/api
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001"; // Ajustado para usar a porta 8001
// --- Funções de Autenticação ---
export async function loginUser(email: string, password: string): Promise<{ access_token: string }> {
  const params = new URLSearchParams();
  params.append('username', email);
  params.append('password', password);

  const response = await fetch(`${API_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

    if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Falha no login');
    }
  return response.json();
  }

// --- Helper de Requisição ---
export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
) {
  // Pega o token salvo
  const token = localStorage.getItem("access_token");

  // Prepara os cabeçalhos. Se tiver token, anexa o cabeçalho 'Authorization: Bearer ...'
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    // Faz a chamada para a API usando o endereço base e o endpoint passado
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Se o status for 401 (Não Autorizado), significa que o token expirou ou é inválido.
    // O ideal seria deslogar o usuário e mandar para o login.
    if (response.status === 401) {
       console.error("Token inválido ou expirado.");
      localStorage.removeItem("access_token");
      // Redireciona para a raiz do subdiretório /financeiro
      if (typeof window !== 'undefined') { // Garante que está no ambiente do navegador
          window.location.href = '/';
}
      throw new Error("Acesso não autorizado. Redirecionando para o login.");
    }

    // If the response is not empty, try to extract the JSON data.
    // If it is empty (eg 204 No Content), it returns null.
    if (response.status === 204) {
      return null;
    }

    const responseData = await response.json();

    // Se a resposta não for OK (status fora da faixa 200-299), lança um erro com a mensagem do backend.
    if (!response.ok) {
      // Usa a mensagem de 'detail' da API FastAPI ou uma mensagem padrão
      throw new Error(responseData.detail || "Ocorreu um erro na requisição.");
    }

    return responseData;
  } catch (error) {
    console.error(`Erro na chamada da API para ${endpoint}:`, error);
    // Propaga o erro para que o componente que chamou a função possa tratá-lo
    throw error;
  }
}

// --- Funções da API Financeira (EXISTENTES) ---
export async function criarMes(mesData: { nome: string; congregacao_id: number; saldo_inicial?: number; }): Promise<Mes> {
  return fetchWithAuth("/meses/", {
    method: "POST",
    body: JSON.stringify(mesData),
  });
}
export async function listarMeses(congregacaoId: number): Promise<Mes[]> {
  return fetchWithAuth(`/congregacoes/${congregacaoId}/meses/`);
}
export async function getMesDetalhes(mesId: number): Promise<Mes> {
  return fetchWithAuth(`/meses/${mesId}`);
}
export async function getSemanasDoMes(mesId: number): Promise<Semana[]> {
  return fetchWithAuth(`/meses/${mesId}/semanas/`);
}
export async function fecharMes(mesId: number): Promise<Mes> {
  return fetchWithAuth(`/meses/${mesId}/fechar`, { method: "PUT" });
}
export async function reabrirMes(mesId: number): Promise<Mes> {
  return fetchWithAuth(`/meses/${mesId}/reabrir`, { method: "PUT" });
}
export async function adicionarSemana(
  mesId: number,
  semanaData: { numero: number; data_inicio: string; data_fim: string; renda_semanal: number; despesas: { descricao: string; valor: number; }[]; }
): Promise<Semana> {
  return fetchWithAuth(`/meses/${mesId}/semanas/`, {
    method: "POST",
    body: JSON.stringify(semanaData),
  });
}
export async function adicionarDespesa(
  mesId: number,
  semanaNumero: number,
  despesaData: DespesaCreateData
): Promise<Despesa> {
  return fetchWithAuth(`/meses/${mesId}/semanas/${semanaNumero}/despesas/`, {
    method: "POST",
    body: JSON.stringify(despesaData),
  });
}
export async function removerDespesa(despesaId: number): Promise<void> {
  return fetchWithAuth(`/despesas/${despesaId}`, {
    method: "DELETE",
  });
}
export async function adicionarRenda(
  semanaId: number,
  rendaData: RendaCreateData
): Promise<Renda> {
  return fetchWithAuth(`/semanas/${semanaId}/rendas/`, {
    method: "POST",
    body: JSON.stringify(rendaData),
  });
}
export async function removerRenda(rendaId: number): Promise<void> {
  return fetchWithAuth(`/rendas/${rendaId}`, {
    method: "DELETE",
  });
}
export async function getBalancete(mesId: number): Promise<any> { // O tipo de retorno pode ser mais específico
  return fetchWithAuth(`/meses/${mesId}/balancete/`);
}
export async function getBalancetePdfUrl(mesId: number): Promise<string> {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE_URL}/meses/${mesId}/balancete/pdf`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error("Erro ao gerar PDF");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
// --- Funções de Cadastro de Hierarquia e Usuários ---
export async function criarDenominacao(denominacaoData: DenominacaoCreateData): Promise<Denominacao> {
  return fetchWithAuth("/denominacoes/", {
    method: "POST",
    body: JSON.stringify(denominacaoData),
  });
  }
// NOVA FUNÇÃO: Listar Denominações
export async function listarDenominacoes(): Promise<Denominacao[]> {
  return fetchWithAuth("/denominacoes/");
}
export async function criarArea(areaData: AreaEclesiasticaCreateData): Promise<AreaEclesiastica> {
  return fetchWithAuth("/areas_eclesiasticas/", {
    method: "POST",
    body: JSON.stringify(areaData),
  });
}
// NOVA FUNÇÃO: Listar Áreas por Denominação
export async function listarAreasPorDenominacao(denominacaoId: number): Promise<AreaEclesiastica[]> {
  return fetchWithAuth(`/denominacoes/${denominacaoId}/areas/`);
}
export async function criarCongregacao(congregacaoData: CongregacaoCreateData): Promise<Congregacao> {
  return fetchWithAuth("/congregacoes/", {
    method: "POST",
    body: JSON.stringify(congregacaoData),
  });
}
export async function criarUsuario(userData: UsuarioCreateData): Promise<Usuario> {
  return fetchWithAuth("/usuarios/", {
    method: "POST",
    body: JSON.stringify(userData),
  });
}
// --- Backup e Restore ---
export async function baixarBackup(): Promise<string> {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE_URL}/backup/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || "Erro ao baixar backup");
}
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
export async function restaurarBackup(file: File): Promise<void> {
  const token = localStorage.getItem("access_token");
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/restore/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || "Erro ao restaurar backup");
  }
}
export async function getMe(): Promise<Usuario> {
  return fetchWithAuth("/users/me/");
}
// --- Funções de Dizimistas/Ofertantes ---
export async function criarDizimista(congregacaoId: number, dizimistaData: DizimistaOfertanteCreateData): Promise<DizimistaOfertante> {
  return fetchWithAuth(`/congregacoes/${congregacaoId}/dizimistas/`, {
    method: "POST",
    body: JSON.stringify(dizimistaData),
  });
}
export async function listarDizimistas(congregacaoId: number): Promise<DizimistaOfertante[]> {
  return fetchWithAuth(`/congregacoes/${congregacaoId}/dizimistas/`);
}
export async function atualizarDizimista(dizimistaId: number, dizimistaData: DizimistaOfertanteUpdateData): Promise<DizimistaOfertante> {
  return fetchWithAuth(`/dizimistas/${dizimistaId}`, {
    method: "PUT",
    body: JSON.stringify(dizimistaData),
  });
}
export async function removerDizimista(dizimistaId: number): Promise<void> {
  return fetchWithAuth(`/dizimistas/${dizimistaId}`, {
    method: "DELETE",
  });
}
// --- Funções de Análise de Mês (Gráficos) ---
export async function getAnalisesMes(mesId: number): Promise<AnaliseMes> {
  return fetchWithAuth(`/meses/${mesId}/analises`);
}
// --- Despesas Recorrentes ---
/**
 * Aciona a duplicação automática de despesas recorrentes para a próxima semana.
 * Geralmente chamada por um botão "Duplicar despesas recorrentes" na UI.
 */
export async function duplicarDespesasRecorrentes(): Promise<any> {
  // Não requer parâmetros – o backend decide quais despesas são recorrentes.
  return fetchWithAuth(`/despesas/recorrentes/duplicar`, { method: "POST" });
}

// --- NOVAS FUNÇÕES PARA O PAINEL MASTER (SUPERUSER) ---

/**
 * Verifica o status de setup inicial do sistema.
 */
export async function getSetupStatus(): Promise<{ setup_complete: boolean }> {
  return fetchWithAuth("/setup/status");
}

/**
 * Realiza o setup inicial do sistema, criando o superusuário e o primeiro tenant.
 */
export async function initializeSetup(payload: SetupPayload): Promise<Usuario> {
  return fetchWithAuth("/setup/initialize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Obtém as estatísticas globais da plataforma para o dashboard do superusuário.
 */
export async function getMasterStats(): Promise<MasterStats> {
  return fetchWithAuth("/master/stats");
}

/**
 * Lista todas as denominações (tenants) no sistema.
 */
export async function listAllTenants(): Promise<Denominacao[]> {
  return fetchWithAuth("/master/tenants");
}

/**
 * Atualiza o status (ativo/inativo) de uma denominação (tenant).
 */
export async function updateTenantStatus(
  tenantId: number,
  statusUpdate: DenominacaoStatusUpdate
): Promise<Denominacao> {
  return fetchWithAuth(`/master/tenants/${tenantId}/status`, {
    method: "PUT",
    body: JSON.stringify(statusUpdate),
  });
}

/**
 * Gera um token de personificação para um usuário específico.
 */
export async function impersonateUser(userId: number): Promise<{ access_token: string }> {
  return fetchWithAuth(`/master/users/${userId}/impersonate`, {
    method: "POST",
  });
}


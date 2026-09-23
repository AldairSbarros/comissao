// financeiro-frontend/lib/api.ts
import axios, { AxiosInstance } from 'axios';
import { 
  Despesa, DespesaCreateData, Mes, Semana, Usuario, Denominacao, 
  DenominacaoCreateData, AreaEclesiastica, AreaEclesiasticaCreateData, 
  Congregacao, CongregacaoCreateData, UsuarioCreateData, DizimistaOfertante, 
  DizimistaOfertanteCreateData, DizimistaOfertanteUpdateData, Renda, 
  RendaCreateData, AnaliseMes 
} from "./types";
import { MasterStats, SetupPayload, TenantCreate, DenominacaoStatusUpdate } from "./schemas";

// A URL base da API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
// Prefixo da aplicação no domínio (precisa espelhar o basePath do next.config.ts).
// Usado em redirects "cruos" do navegador, que não aplicam o basePath automaticamente.
const BASE_PATH = "/financeiro";

// Cria e exporta a instância do Axios
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

// Interceptor para adicionar o token JWT
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => Promise.reject(error));

// Interceptor para tratar erros de autenticação
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401 && typeof window !== 'undefined') {
      const url: string = error.config?.url || '';
      const isLoginAttempt = url.includes('/token');
      // Só redireciona quando havia um token salvo (sessão expirada).
      // Uma tentativa de login com senha errada (401 no /token) deve deixar o
      // formulário mostrar o erro, não dar reload de volta para a tela de login.
      if (!isLoginAttempt && localStorage.getItem("access_token")) {
        localStorage.removeItem("access_token");
        // Redirect "cru" do navegador: precisa incluir o basePath manualmente,
        // senão cai na raiz do domínio (ex.: landing page de outro site no mesmo domínio).
        window.location.href = `${BASE_PATH}/`;
      }
    }
    return Promise.reject(error);
  }
);

// --- Funções de Autenticação ---
export const loginUser = async (email: string, password: string): Promise<{ access_token: string }> => {
  const params = new URLSearchParams();
  params.append('username', email);
  params.append('password', password);
  const response = await api.post('/token', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return response.data;
};

// --- Funções da API Financeira (Refatoradas) ---
export const criarMes = async (mesData: { nome: string; congregacao_id: number; saldo_inicial?: number; }): Promise<Mes> => {
  const response = await api.post("/meses/", mesData);
  return response.data;
};

export const listarMeses = async (congregacaoId: number): Promise<Mes[]> => {
  const response = await api.get(`/congregacoes/${congregacaoId}/meses/`);
  return response.data;
};

// ... (todas as suas funções refatoradas)

export const getMesDetalhes = async (mesId: number): Promise<Mes> => {
    const response = await api.get(`/meses/${mesId}`);
    return response.data;
}
export const getSemanasDoMes = async (mesId: number): Promise<Semana[]> => {
    const response = await api.get(`/meses/${mesId}/semanas/`);
    return response.data;
}
export const fecharMes = async (mesId: number): Promise<Mes> => {
    const response = await api.put(`/meses/${mesId}/fechar`);
    return response.data;
}
export const reabrirMes = async (mesId: number): Promise<Mes> => {
    const response = await api.put(`/meses/${mesId}/reabrir`);
    return response.data;
}
export const adicionarSemana = async (
mesId: number,
semanaData: { numero: number; data_inicio: string; data_fim: string; renda_semanal: number; despesas: { descricao: string; valor: number; }[]; }
): Promise<Semana> => {
    const response = await api.post(`/meses/${mesId}/semanas/`, semanaData);
    return response.data;
}
export const adicionarDespesa = async (
mesId: number,
semanaNumero: number,
despesaData: DespesaCreateData
): Promise<Despesa> => {
    const response = await api.post(`/meses/${mesId}/semanas/${semanaNumero}/despesas/`, despesaData);
    return response.data;
}
export const removerDespesa = async (despesaId: number): Promise<void> => {
    await api.delete(`/despesas/${despesaId}`);
}
export const adicionarRenda = async (
semanaId: number,
rendaData: RendaCreateData
): Promise<Renda> => {
    const response = await api.post(`/semanas/${semanaId}/rendas/`, rendaData);
    return response.data;
}
export const removerRenda = async (rendaId: number): Promise<void> => {
    await api.delete(`/rendas/${rendaId}`);
}
export const getBalancete = async (mesId: number): Promise<any> => {
    const response = await api.get(`/meses/${mesId}/balancete/`);
    return response.data;
}
export const getBalancetePdfUrl = async (mesId: number): Promise<string> => {
    const response = await api.get(`/meses/${mesId}/balancete/pdf`, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
}
export const criarDenominacao = async (denominacaoData: DenominacaoCreateData): Promise<Denominacao> => {
    const response = await api.post("/denominacoes/", denominacaoData);
    return response.data;
}
export const listarDenominacoes = async (): Promise<Denominacao[]> => {
    const response = await api.get("/denominacoes/");
    return response.data;
}
export const criarArea = async (areaData: AreaEclesiasticaCreateData): Promise<AreaEclesiastica> => {
    const response = await api.post("/areas_eclesiasticas/", areaData);
    return response.data;
}
export const listarAreasPorDenominacao = async (denominacaoId: number): Promise<AreaEclesiastica[]> => {
    const response = await api.get(`/denominacoes/${denominacaoId}/areas/`);
    return response.data;
}
export const criarCongregacao = async (congregacaoData: CongregacaoCreateData): Promise<Congregacao> => {
    const response = await api.post("/congregacoes/", congregacaoData);
    return response.data;
}
export const criarUsuario = async (userData: UsuarioCreateData): Promise<Usuario> => {
    const response = await api.post("/usuarios/", userData);
    return response.data;
}
export const baixarBackup = async (): Promise<string> => {
    const response = await api.post('/backup/', {}, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/octet-stream' });
    return URL.createObjectURL(blob);
}
export const restaurarBackup = async (file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    await api.post('/restore/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
}
export const getMe = async (): Promise<Usuario> => {
    const response = await api.get("/users/me/");
    return response.data;
}
export const criarDizimista = async (congregacaoId: number, dizimistaData: DizimistaOfertanteCreateData): Promise<DizimistaOfertante> => {
    const response = await api.post(`/congregacoes/${congregacaoId}/dizimistas/`, dizimistaData);
    return response.data;
}
export const listarDizimistas = async (congregacaoId: number): Promise<DizimistaOfertante[]> => {
    const response = await api.get(`/congregacoes/${congregacaoId}/dizimistas/`);
    return response.data;
}
export const atualizarDizimista = async (dizimistaId: number, dizimistaData: DizimistaOfertanteUpdateData): Promise<DizimistaOfertante> => {
    const response = await api.put(`/dizimistas/${dizimistaId}`, dizimistaData);
    return response.data;
}
export const removerDizimista = async (dizimistaId: number): Promise<void> => {
    await api.delete(`/dizimistas/${dizimistaId}`);
}
export const getAnalisesMes = async (mesId: number): Promise<AnaliseMes> => {
    const response = await api.get(`/meses/${mesId}/analises`);
    return response.data;
}
export const duplicarDespesasRecorrentes = async (): Promise<any> => {
    const response = await api.post(`/despesas/recorrentes/duplicar`);
    return response.data;
}

// --- NOVAS FUNÇÕES PARA O PAINEL MASTER (SUPERUSER) ---
export const getSetupStatus = async (): Promise<{ setup_complete: boolean }> => {
  // Usa uma chamada direta do axios sem o interceptor de token, pois este endpoint é público
  const response = await axios.get(`${API_BASE_URL}/setup/status`);
  return response.data;
};

export const initializeSetup = async (payload: SetupPayload): Promise<Usuario> => {
  const response = await axios.post(`${API_BASE_URL}/setup/initialize`, payload);
  return response.data;
};

export const getMasterStats = async (): Promise<MasterStats> => {
  const response = await api.get("/master/stats");
  return response.data;
};

export const listAllTenants = async (): Promise<Denominacao[]> => {
  const response = await api.get("/master/tenants");
  return response.data;
};

export const createTenant = async (payload: TenantCreate): Promise<Denominacao> => {
  const response = await api.post("/master/tenants", payload);
  return response.data;
};

export const updateTenantStatus = async (tenantId: number, statusUpdate: DenominacaoStatusUpdate): Promise<Denominacao> => {
  const response = await api.put(`/master/tenants/${tenantId}/status`, statusUpdate);
  return response.data;
};

export const impersonateUser = async (userId: number): Promise<{ access_token: string }> => {
  const response = await api.post(`/master/users/${userId}/impersonate`);
  return response.data;
};
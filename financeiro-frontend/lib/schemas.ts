// financeiro-frontend/lib/schemas.ts
// Removido import de EmailStr, usamos string nativa do TS

// --- Schemas do Painel Master (Superuser) ---

export interface InitialTenantCreate {
  nome_denominacao: string;
  admin_email: string;
  admin_password: string;
}

export interface SetupPayload {
  superuser_email: string;
  superuser_password: string;
  tenant: InitialTenantCreate;
}

export interface TenantStats {
  id: number;
  nome: string;
  is_active: boolean;
  data_criacao: string; // ou Date
  total_usuarios: number;
  total_transacoes: number;
}

export interface MasterStats {
  total_tenants: number;
  tenants_ativos: number;
  tenants_suspensos: number;
  total_usuarios: number;
  volume_financeiro_global: number;
  crescimento_tenants_mensal: { [key: string]: number };
  ranking_tenants_ativos: TenantStats[];
  tamanho_db_mb: number;
}

export interface DenominacaoStatusUpdate {
    is_active: boolean;
}
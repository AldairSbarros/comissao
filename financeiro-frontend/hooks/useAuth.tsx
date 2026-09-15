// financeiro-frontend/hooks/useAuth.ts
import { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api'; // Certifique-se de que o caminho está correto
import { jwtDecode } from 'jwt-decode'; // Instale: npm install jwt-decode

// Defina a interface para o objeto de usuário autenticado
interface AuthUser {
  email: string;
  funcao: string;
  is_superuser: boolean; // Adicionado para identificar o superusuário
  denominacao_id?: number;
  area_id?: number;
  congregacao_id?: number;
  // Adicione outros campos do payload do token conforme necessário
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadUserFromLocalStorage = useCallback(() => {
    try {
      const storedToken = localStorage.getItem('access_token');
      if (storedToken) {
        const decodedUser: AuthUser = jwtDecode(storedToken);
        setToken(storedToken);
        setUser(decodedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      }
    } catch (error) {
      console.error('Erro ao decodificar token do localStorage:', error);
      localStorage.removeItem('access_token'); // Limpa token inválido
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserFromLocalStorage();
  }, [loadUserFromLocalStorage]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const response = await api.post('/token', new URLSearchParams({ username: email, password: password }));
      const accessToken = response.data.access_token;
      localStorage.setItem('access_token', accessToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

      const decodedUser: AuthUser = jwtDecode(accessToken);
      setToken(accessToken);
      setUser(decodedUser);

      // Redirecionamento baseado na função (novo: is_superuser)
      if (decodedUser.is_superuser) {
        router.push('/superuser-dashboard');
      } else {
        router.push('/dashboard');
      }

    } catch (error) {
      console.error('Erro no login:', error);
      logout(); // Garante que o estado de autenticação seja limpo em caso de erro
      throw error;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setToken(null);
    router.push('/'); // Redireciona para a página de login
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

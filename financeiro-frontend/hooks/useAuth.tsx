// financeiro-frontend/hooks/useAuth.tsx
"use client";

import { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { jwtDecode } from 'jwt-decode';

// Definição da interface para o usuário extraído do token JWT
export interface AuthUser {
  sub: string; // O e-mail do usuário
  funcao: string;
  is_superuser: boolean;
  denominacao_id?: number;
  area_id?: number;
  congregacao_id?: number;
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
    setLoading(true);
    try {
      const storedToken = localStorage.getItem('access_token');
      if (storedToken) {
        const decodedUser = jwtDecode<AuthUser>(storedToken);
        setToken(storedToken);
        setUser(decodedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      }
    } catch (error) {
      console.error('Token inválido ou expirado, limpando localStorage:', error);
      localStorage.removeItem('access_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserFromLocalStorage();
  }, [loadUserFromLocalStorage]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);
    
    try {
      const response = await api.post('/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      const accessToken = response.data.access_token;
      
      localStorage.setItem('access_token', accessToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      
      const decodedUser = jwtDecode<AuthUser>(accessToken);
      setToken(accessToken);
      setUser(decodedUser);

      if (decodedUser.is_superuser) {
        router.push('/superuser-dashboard');
      } else {
        router.push('/dashboard');
      }

    } catch (error) {
      console.error('Erro no login:', error);
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
    router.push('/');
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
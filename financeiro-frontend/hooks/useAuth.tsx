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
  isImpersonating: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  restoreSuperuser: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);
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
        setIsImpersonating(Boolean(localStorage.getItem('superuser_token')));
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
      // Login normal encerra qualquer personificação anterior.
      localStorage.removeItem('superuser_token');
      setIsImpersonating(false);

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
    localStorage.removeItem('superuser_token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setToken(null);
    setIsImpersonating(false);
    router.push('/');
  }, [router]);

  const restoreSuperuser = useCallback((): boolean => {
    const superuserToken = localStorage.getItem('superuser_token');
    if (!superuserToken) return false;
    try {
      const decodedUser = jwtDecode<AuthUser>(superuserToken);
      localStorage.setItem('access_token', superuserToken);
      localStorage.removeItem('superuser_token');
      api.defaults.headers.common['Authorization'] = `Bearer ${superuserToken}`;
      setToken(superuserToken);
      setUser(decodedUser);
      setIsImpersonating(false);
      return true;
    } catch (error) {
      console.error('Token de superuser inválido:', error);
      localStorage.removeItem('superuser_token');
      setIsImpersonating(false);
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, isImpersonating, login, logout, restoreSuperuser }}>
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
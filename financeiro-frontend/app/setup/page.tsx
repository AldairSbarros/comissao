"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api"; // Import do cliente de API

interface SetupFormData {
  superuser_email: string;
  superuser_password: string;
  tenant_nome_denominacao: string;
  tenant_admin_email: string;
  tenant_admin_password: string;
}

export default function SetupPage() {
  const [formData, setFormData] = useState<SetupFormData>({
    superuser_email: "",
    superuser_password: "",
    tenant_nome_denominacao: "",
    tenant_admin_email: "",
    tenant_admin_password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof SetupFormData
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const payload = {
        superuser_email: formData.superuser_email,
        superuser_password: formData.superuser_password,
        tenant: {
          nome_denominacao: formData.tenant_nome_denominacao,
          admin_email: formData.tenant_admin_email,
          admin_password: formData.tenant_admin_password,
        }
      };

      const response = await api.post("/setup/initialize", payload);
      
      if (response.status === 201) {
        toast.success("Setup realizado com sucesso!");
        setTimeout(() => {
          router.push("/"); // Redireciona para a página de login
          // Necessário recarregar para limpar o estado e forçar a verificação do status novamente
          window.location.reload(); 
        }, 1000);
      } else {
        throw new Error("Erro inexistente");
      }
    } catch (error: any) {
      console.error("Erro ao realizar setup:", error);
      const errorMessage = error.response?.data?.detail || "Erro desconhecido ao realizar o setup.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-slate-950">
      <Card className="w-full max-w-md bg-slate-900 border-slate-800 text-white">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">Inicialização do Sistema</CardTitle>
          <CardDescription>
            Configure o Superusuário da Plataforma e a primeira Denominação (Tenant) para começar a usar o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-6">
            
            {/* Seção: Superusuário da Plataforma */}
            <div className="space-y-4 border-b border-slate-700 pb-4">
              <h3 className="text-lg font-semibold text-emerald-400">1. Superusuário da Plataforma</h3>
              <p className="text-sm text-slate-400">
                Este usuário terá acesso total e irrestrito a toda a plataforma.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="superuser_email">Seu E-mail</Label>
                <Input
                    id="superuser_email"
                    type="email"
                    placeholder="admin@aletheia.ia.br"
                    required
                    value={formData.superuser_email}
                    onChange={(e) => handleChange(e, "superuser_email")}
                    className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="superuser_password">Sua Senha</Label>
                    <Input
                    id="superuser_password"
                    type="password"
                    placeholder="Defina uma senha forte"
                    required
                    value={formData.superuser_password}
                    onChange={(e) => handleChange(e, "superuser_password")}
                    className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  />
                </div>
            </div>

            {/* Seção: Primeira Denominação */}
            <div className="space-y-4 border-b border-slate-700 pb-4">
              <h3 className="text-lg font-semibold text-emerald-400">2. Primeira Denominação (Tenant)</h3>
              <p className="text-sm text-slate-400">
                Cadastre a primeira igreja e o administrador dela.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="tenant_nome_denominacao">Nome da Denominação</Label>
                <Input
                    id="tenant_nome_denominacao"
                    type="text"
                    placeholder="Ex: Assembleias de Deus"
                    required
                    value={formData.tenant_nome_denominacao}
                    onChange={(e) => handleChange(e, "tenant_nome_denominacao")}
                    className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tenant_admin_email">E-mail do Administrador</Label>
                  <Input
                    id="tenant_admin_email"
                    type="email"
                    placeholder="admin@denominacao.com"
                    required
                    value={formData.tenant_admin_email}
                    onChange={(e) => handleChange(e, "tenant_admin_email")}
                    className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tenant_admin_password">Senha do Administrador</Label>
                    <Input
                    id="tenant_admin_password"
                    type="password"
                    placeholder="Defina a senha do administrador"
                    required
                    value={formData.tenant_admin_password}
                    onChange={(e) => handleChange(e, "tenant_admin_password")}
                    className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  />
                </div>
            </div>

            <Button type="submit" className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500" disabled={isLoading}>
              {isLoading ? "Configurando..." : "Concluir Inicialização"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
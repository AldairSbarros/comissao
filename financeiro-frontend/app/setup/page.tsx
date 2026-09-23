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
}

export default function SetupPage() {
  const [formData, setFormData] = useState<SetupFormData>({
    superuser_email: "",
    superuser_password: "",
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
      };

      const response = await api.post("/setup/initialize", payload);
      
      if (response.status === 201) {
        toast.success("Superusuário criado com sucesso! Agora crie as denominações no Painel Master.");
        setTimeout(() => {
          router.push("/"); // Redireciona para a página de login
          // Necessário recarregar para limpar o estado e forçar a verificação do status novamente
          window.location.reload(); 
        }, 1000);
      } else {
        throw new Error("Erro inexistente");
      }
    } catch (error) {
      console.error("Erro ao realizar setup:", error);
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Erro desconhecido ao realizar o setup.");
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
            Crie o Superusuário da Plataforma. As denominações (tenants) e seus
            administradores serão criados depois, no Painel Master.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-6">
            
            {/* Seção: Superusuário da Plataforma */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-emerald-400">Superusuário da Plataforma</h3>
              <p className="text-sm text-slate-400">
                Este usuário é o dono do sistema, tem acesso total e não pertence a nenhuma denominação.
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
                    placeholder="Defina uma senha forte (mín. 12 caracteres)"
                    required
                    minLength={12}
                    value={formData.superuser_password}
                    onChange={(e) => handleChange(e, "superuser_password")}
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
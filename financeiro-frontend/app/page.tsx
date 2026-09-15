"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password); // A função login virá do useAuth
      toast.success("Login realizado com sucesso!");
      router.push("/dashboard"); // Redireciona para o painel
    } catch (error) {
      toast.error("Email ou senha inválidos.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-slate-950">
      <Card className="w-full max-w-sm bg-slate-900 border-slate-800 text-white">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Painel Financeiro</CardTitle>
          <CardDescription>Acesse com suas credenciais</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                  id="email"
                  type="email"
                placeholder="seu.email@exemplo.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                />
              </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-800 border-slate-700 focus:ring-emerald-500"
                />
              </div>
            <Button type="submit" className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500" disabled={isLoading}>
              {isLoading ? "Verificando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}


"use client";

import { useState } from "react";
import { Eye, EyeOff, AlertCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRecoverOpen, setIsRecoverOpen] = useState(false);
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await login(email, password); // O login() já faz o redirect para o painel correto
      toast.success("Login realizado com sucesso!");
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (status === 401) {
        setErrorMessage(detail || "Email ou senha incorretos. Verifique suas credenciais e tente novamente.");
      } else if (detail) {
        setErrorMessage(detail);
      } else {
        setErrorMessage("Não foi possível conectar ao servidor. Verifique se o backend está no ar.");
      }
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <button
                  type="button"
                  onClick={() => setIsRecoverOpen(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-800 border-slate-700 focus:ring-emerald-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            <Button type="submit" className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500" disabled={isLoading}>
              {isLoading ? "Verificando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={isRecoverOpen} onOpenChange={setIsRecoverOpen}>
        <DialogContent className="bg-slate-900 text-white border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound size={18} className="text-emerald-400" />
              Recuperar senha
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              Por segurança, a recuperação de senha não é feita pelo sistema.
              Entre em contato com o administrador da sua denominação, área ou congregação
              para redefinir sua senha.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-slate-800 bg-slate-950/50">
            <Button onClick={() => setIsRecoverOpen(false)} className="bg-emerald-600 hover:bg-emerald-500">
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
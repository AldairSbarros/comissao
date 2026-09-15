"use client";

import { useState } from "react";
import { baixarBackup, restaurarBackup } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, UploadCloud } from "lucide-react";

export function PainelBackup() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleBackup = async () => {
    setIsProcessing(true);
    try {
      const url = await baixarBackup();
      const a = document.createElement('a');
      a.href = url;
      // Nome sugerido para o arquivo
      a.download = `financeiro_backup_${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Backup gerado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Falha ao gerar backup.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (!file) {
      toast.error("Por favor, selecione um arquivo .db primeiro.");
      return;
    }
    if (!confirm("CUIDADO! Esta ação vai apagar todo o banco de dados atual e substituí-lo pelo backup. Tem certeza absoluta?")) {
      return;
    }

    setIsProcessing(true);
    try {
      await restaurarBackup(file);
      toast.success("Backup restaurado com sucesso! Recomendamos recarregar a página.");
      setFile(null);
      // Forçar reload após 2 segundos para limpar caches do navegador
      setTimeout(() => window.location.reload(), 2000);
    } catch (error: any) {
      toast.error(error.message || "Falha ao restaurar backup.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Gerar Backup</CardTitle>
          <CardDescription>
            Baixe uma cópia completa do banco de dados atual (SQLite .db). Guarde em local seguro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackup} disabled={isProcessing} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            {isProcessing ? "Gerando..." : "Baixar Backup (.db)"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Restaurar Backup</CardTitle>
          <CardDescription>
            Atenção: A restauração substituirá <strong>TODOS</strong> os dados atuais pelos dados do arquivo enviado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input 
            type="file" 
            accept=".db" 
            onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} 
          />
          <Button 
            onClick={handleRestore} 
            disabled={!file || isProcessing} 
            variant="destructive" 
            className="w-full"
          >
            <UploadCloud className="mr-2 h-4 w-4" />
            {isProcessing ? "Restaurando..." : "Enviar e Restaurar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

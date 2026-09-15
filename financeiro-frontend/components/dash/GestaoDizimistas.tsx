"use client";

import { useState, useEffect } from "react";
import { DizimistaOfertante, DizimistaOfertanteCreateData } from "@/lib/types";
import { listarDizimistas, criarDizimista, removerDizimista } from "@/lib/api";
import { DizimistaForm } from "@/components/forms/DizimistaForm";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface GestaoDizimistasProps {
  congregacaoId: number;
}

export function GestaoDizimistas({ congregacaoId }: GestaoDizimistasProps) {
  const [dizimistas, setDizimistas] = useState<DizimistaOfertante[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDizimistas = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listarDizimistas(congregacaoId);
      setDizimistas(data);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dizimistas.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDizimistas();
  }, [congregacaoId]);

  const handleCreateDizimista = async (data: DizimistaOfertanteCreateData) => {
    setIsSubmitting(true);
    try {
      await criarDizimista(congregacaoId, data);
      await fetchDizimistas(); // Recarrega a lista
    } catch (error) {
      throw error; // Propaga para o form mostrar o erro
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDizimista = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este registro?")) return;
    
    try {
      await removerDizimista(id);
      await fetchDizimistas();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir registro.");
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      {/* Coluna do Formulário */}
      <div className="md:col-span-1">
        <DizimistaForm 
          onSubmit={handleCreateDizimista} 
          isLoading={isSubmitting} 
        />
      </div>

      {/* Coluna da Tabela */}
      <div className="md:col-span-2 space-y-4">
        <h3 className="text-lg font-semibold">Dizimistas e Ofertantes Cadastrados</h3>
        
        {isLoading ? (
          <p>Carregando...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : dizimistas.length === 0 ? (
          <p className="text-muted-foreground">Nenhum registro encontrado.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dizimistas.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell>{d.email || '-'}</TableCell>
                    <TableCell>{d.telefone || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteDizimista(d.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

    </div>
  );
}

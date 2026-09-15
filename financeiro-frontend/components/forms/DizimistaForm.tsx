"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DizimistaOfertanteCreateData } from "@/lib/types";

interface DizimistaFormProps {
  onSubmit: (data: DizimistaOfertanteCreateData) => Promise<void>;
  isLoading: boolean;
  initialData?: DizimistaOfertanteCreateData & { id?: number }; // Para edição opcional no futuro
}

export function DizimistaForm({ onSubmit, isLoading, initialData }: DizimistaFormProps) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<DizimistaOfertanteCreateData>({
    defaultValues: initialData || { nome: "", email: "", telefone: "" }
  });

  const [formError, setFormError] = useState<string | null>(null);

  const handleFormSubmit = async (data: DizimistaOfertanteCreateData) => {
    setFormError(null);
    try {
      await onSubmit(data);
      if (!initialData) {
        reset(); // Limpa o form após criação com sucesso
      }
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar dizimista/ofertante.");
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{initialData ? 'Editar Dizimista/Ofertante' : 'Novo Dizimista/Ofertante'}</CardTitle>
        <CardDescription>Preencha os dados abaixo.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <CardContent className="space-y-4">
          {formError && <div className="text-red-500 text-sm font-medium">{formError}</div>}
          
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo *</Label>
            <Input
              id="nome"
              placeholder="Ex: João Silva"
              {...register("nome", { required: "O nome é obrigatório" })}
            />
            {errors.nome && <p className="text-red-500 text-sm">{errors.nome.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail (Opcional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="Ex: joao@email.com"
              {...register("email", { 
                pattern: {
                  value: /\S+@\S+\.\S+/,
                  message: "Formato de e-mail inválido"
                }
              })}
            />
            {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone (Opcional)</Label>
            <Input
              id="telefone"
              placeholder="Ex: (11) 99999-9999"
              {...register("telefone")}
            />
          </div>

        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Salvando..." : (initialData ? "Atualizar" : "Cadastrar")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RendaCreateData, DizimistaOfertante } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RendaFormProps {
  onSubmit: (data: RendaCreateData) => Promise<void>;
  isLoading: boolean;
  dizimistas: DizimistaOfertante[];
  dataInicioSemana: string;
  dataFimSemana: string;
}

export function RendaForm({ onSubmit, isLoading, dizimistas, dataInicioSemana, dataFimSemana }: RendaFormProps) {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<RendaCreateData>({
    defaultValues: {
      tipo: "",
      valor: 0,
      data_registro: "",
      metodo_pagamento: "",
      dizimista_ofertante_id: undefined,
    }
  });

  const [formError, setFormError] = useState<string | null>(null);
  
  // Watch necessary values for controlled select components
  const tipoValue = watch("tipo");
  const metodoPagamentoValue = watch("metodo_pagamento");
  const dizimistaIdValue = watch("dizimista_ofertante_id");

  const handleFormSubmit = async (data: RendaCreateData) => {
    setFormError(null);
    try {
      // Ensure dizimista_id is either a number or undefined, not a string "none"
      const payload = {
        ...data,
        dizimista_ofertante_id: data.dizimista_ofertante_id && data.dizimista_ofertante_id.toString() !== "none" 
          ? Number(data.dizimista_ofertante_id) 
          : undefined
      };
      
      await onSubmit(payload);
      reset({ tipo: "", valor: 0, data_registro: "", metodo_pagamento: "", dizimista_ofertante_id: undefined, numero_recibo: "", observacao: "" });
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar renda.");
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {formError && <div className="text-red-500 text-sm font-medium">{formError}</div>}
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tipo">Tipo de Renda *</Label>
          <Select           onValueChange={(val) => setValue("tipo", val || "", { shouldValidate: true })} value={tipoValue}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Dízimo">Dízimo</SelectItem>
              <SelectItem value="Oferta">Oferta</SelectItem>
              <SelectItem value="Oferta de Missões">Oferta de Missões</SelectItem>
              <SelectItem value="Campanha">Campanha</SelectItem>
              <SelectItem value="Outros">Outros</SelectItem>
            </SelectContent>
          </Select>
          {errors.tipo && <p className="text-red-500 text-sm">O tipo é obrigatório</p>}
          {/* Hidden input to register the value */}
          <input type="hidden" {...register("tipo", { required: true })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="valor">Valor (R$) *</Label>
          <Input
            id="valor"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            {...register("valor", { required: "O valor é obrigatório", valueAsNumber: true, min: 0.01 })}
          />
          {errors.valor && <p className="text-red-500 text-sm">{errors.valor.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="data_registro">Data do Recebimento *</Label>
          <Input
            id="data_registro"
            type="date"
            min={dataInicioSemana}
            max={dataFimSemana}
            {...register("data_registro", { required: "A data é obrigatória" })}
          />
          {errors.data_registro && <p className="text-red-500 text-sm">{errors.data_registro.message}</p>}
          <p className="text-xs text-muted-foreground">Deve estar entre {dataInicioSemana} e {dataFimSemana}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="metodo_pagamento">Método de Pagamento *</Label>
          <Select           onValueChange={(val) => setValue("metodo_pagamento", val || "", { shouldValidate: true })} value={metodoPagamentoValue}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Pix">Pix</SelectItem>
              <SelectItem value="Espécie">Espécie</SelectItem>
              <SelectItem value="Transferência">Transferência Bancária</SelectItem>
              <SelectItem value="Cartão">Cartão de Crédito/Débito</SelectItem>
              <SelectItem value="Cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
          {errors.metodo_pagamento && <p className="text-red-500 text-sm">O método é obrigatório</p>}
          <input type="hidden" {...register("metodo_pagamento", { required: true })} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dizimista">Dizimista / Ofertante (Opcional)</Label>
        <Select 
          onValueChange={(val) => setValue("dizimista_ofertante_id", val === "none" ? undefined : Number(val))} 
          value={dizimistaIdValue ? dizimistaIdValue.toString() : "none"}
        >
          <SelectTrigger>
            <SelectValue placeholder="Vincular a um membro (Opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">-- Não vincular (Anônimo) --</SelectItem>
            {dizimistas.map((d) => (
              <SelectItem key={d.id} value={d.id.toString()}>{d.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="numero_recibo">Nº Recibo (Opcional)</Label>
          <Input id="numero_recibo" placeholder="Ex: 12345" {...register("numero_recibo")} />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="observacao">Observação (Opcional)</Label>
          <Input id="observacao" placeholder="Ex: Referente a campanha X" {...register("observacao")} />
        </div>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Lançando..." : "Lançar Renda"}
      </Button>
    </form>
  );
}

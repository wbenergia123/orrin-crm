import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Paciente, Produto } from '../types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

// Campos agro do cliente, editados direto no painel do kanban.
export function FichaAgro({ paciente }: { paciente: Paciente }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    cidade: paciente.cidade ?? '',
    atividade: paciente.atividade ?? '',
    maquinas: paciente.maquinas ?? '',
    produto_interesse_id: paciente.produto_interesse_id ?? '',
    valor_estimado: paciente.valor_estimado != null ? String(paciente.valor_estimado) : '',
  })

  const { data: produtos = [] } = useQuery<Produto[]>({
    queryKey: ['produtos'],
    queryFn: async () => (await api.get('/produtos')).data,
  })

  const { mutate: salvar, isPending } = useMutation({
    mutationFn: () =>
      api.patch(`/pacientes/${paciente.id}`, {
        cidade: form.cidade || null,
        atividade: form.atividade || null,
        maquinas: form.maquinas || null,
        produto_interesse_id: form.produto_interesse_id || null,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pacientes-kanban'] }),
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="border-b border-gray-100 p-4 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase">Dados do negócio</p>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Cidade</Label><Input value={form.cidade} onChange={set('cidade')} /></div>
        <div><Label>Atividade</Label><Input value={form.atividade} onChange={set('atividade')} placeholder="soja, milho..." /></div>
      </div>
      <div><Label>Máquinas</Label><Input value={form.maquinas} onChange={set('maquinas')} placeholder="trator marca/modelo" /></div>
      <div>
        <Label>Produto de interesse</Label>
        <select value={form.produto_interesse_id} onChange={set('produto_interesse_id')} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm">
          <option value="">—</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <div><Label>Valor estimado (R$)</Label><Input type="number" min="0" step="0.01" value={form.valor_estimado} onChange={set('valor_estimado')} /></div>
      <Button size="sm" disabled={isPending} onClick={() => salvar()}>Salvar</Button>
    </div>
  )
}

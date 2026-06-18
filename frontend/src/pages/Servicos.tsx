import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { Servico } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

function ServicoDialog({ servico, onClose }: { servico?: Servico; onClose: () => void }) {
  const qc = useQueryClient()
  const [nome, setNome] = useState(servico?.nome ?? '')
  const [preco, setPreco] = useState(servico ? String(servico.preco) : '')
  const [duracao, setDuracao] = useState(servico ? String(servico.duracao_minutos) : '60')

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const body = { nome, preco: Number(preco), duracao_minutos: Number(duracao) }
      return servico
        ? api.patch(`/servicos/${servico.id}`, body)
        : api.post('/servicos', body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicos'] })
      onClose()
    },
  })

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label>Nome do procedimento</Label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Botox" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Preço (R$)</Label>
          <Input type="number" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="800" />
        </div>
        <div className="space-y-1">
          <Label>Duração (min)</Label>
          <Input type="number" value={duracao} onChange={(e) => setDuracao(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => mutate()} disabled={isPending} className="w-full">
        {isPending ? 'Salvando...' : servico ? 'Salvar alterações' : 'Adicionar serviço'}
      </Button>
    </div>
  )
}

export function Servicos() {
  const qc = useQueryClient()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Servico | undefined>()

  const { data: servicos = [], isLoading } = useQuery<Servico[]>({
    queryKey: ['servicos'],
    queryFn: async () => (await api.get('/servicos')).data,
  })

  const { mutate: excluir } = useMutation({
    mutationFn: (id: string) => api.delete(`/servicos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servicos'] }),
  })

  function abrirEdicao(s: Servico) {
    setEditando(s)
    setDialogAberto(true)
  }

  function fecharDialog() {
    setDialogAberto(false)
    setEditando(undefined)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Serviços</h1>
        <Dialog open={dialogAberto} onOpenChange={(open) => { if (!open) fecharDialog(); else setDialogAberto(true) }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2" onClick={() => { setEditando(undefined); setDialogAberto(true) }}>
              <Plus size={15} /> Novo serviço
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? 'Editar serviço' : 'Adicionar serviço'}</DialogTitle>
            </DialogHeader>
            <ServicoDialog servico={editando} onClose={fecharDialog} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Procedimento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Duração</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Preço</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            )}
            {servicos.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{s.nome}</td>
                <td className="px-4 py-3 text-gray-500">{s.duracao_minutos} min</td>
                <td className="px-4 py-3 text-gray-700">
                  R$ {Number(s.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => abrirEdicao(s)} className="text-gray-400 hover:text-gray-700">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => excluir(s.id)} className="text-gray-400 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

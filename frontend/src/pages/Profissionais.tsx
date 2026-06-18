import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../api/client'
import type { Profissional } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

function ProfissionalDialog({
  profissional,
  onClose,
}: {
  profissional?: Profissional
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [nome, setNome] = useState(profissional?.nome ?? '')

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      profissional
        ? api.patch(`/profissionais/${profissional.id}`, { nome })
        : api.post('/profissionais', { nome }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais'] })
      qc.invalidateQueries({ queryKey: ['profissionais-ativos'] })
      onClose()
    },
  })

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label>Nome do profissional</Label>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Dra. Maria Silva"
        />
      </div>
      <Button onClick={() => mutate()} disabled={isPending || !nome.trim()} className="w-full">
        {isPending ? 'Salvando...' : profissional ? 'Salvar alterações' : 'Adicionar profissional'}
      </Button>
    </div>
  )
}

export function Profissionais() {
  const qc = useQueryClient()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Profissional | undefined>()

  const { data: profissionais = [], isLoading } = useQuery<Profissional[]>({
    queryKey: ['profissionais'],
    queryFn: async () => (await api.get('/profissionais')).data,
  })

  const { mutate: toggleAtivo } = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      api.patch(`/profissionais/${id}`, { ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profissionais'] }),
  })

  function abrirEdicao(p: Profissional) {
    setEditando(p)
    setDialogAberto(true)
  }

  function fecharDialog() {
    setDialogAberto(false)
    setEditando(undefined)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Profissionais</h1>
        <Dialog
          open={dialogAberto}
          onOpenChange={(open) => { if (!open) fecharDialog(); else setDialogAberto(true) }}
        >
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => { setEditando(undefined); setDialogAberto(true) }}
            >
              <Plus size={15} /> Novo profissional
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? 'Editar profissional' : 'Adicionar profissional'}</DialogTitle>
            </DialogHeader>
            <ProfissionalDialog profissional={editando} onClose={fecharDialog} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Nome</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={3} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            )}
            {profissionais.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{p.nome}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => abrirEdicao(p)}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => toggleAtivo({ id: p.id, ativo: !p.ativo })}
                      className="text-gray-400 hover:text-gray-700"
                      title={p.ativo ? 'Desativar' : 'Ativar'}
                    >
                      {p.ativo
                        ? <ToggleRight size={22} className="text-emerald-500" />
                        : <ToggleLeft size={22} />}
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

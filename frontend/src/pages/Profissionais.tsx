import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Camera } from 'lucide-react'
import { getAvatarUrl, getAvatarFallback } from '../lib/avatar'
import { api } from '../api/client'
import type { Profissional } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

function FotoProfissional({ profissional }: { profissional: Profissional }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [fotoUrl, setFotoUrl] = useState(profissional.foto_url)

  const { mutate: enviarFoto, isPending: enviando } = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('foto', file)
      return api.post(`/profissionais/${profissional.id}/foto`, form)
    },
    onSuccess: (res) => {
      setErro(null)
      setFotoUrl(res.data.foto_url)
      qc.invalidateQueries({ queryKey: ['profissionais'] })
      qc.invalidateQueries({ queryKey: ['profissionais-todos'] })
    },
    onError: () => setErro('Não foi possível enviar a foto. Tente novamente.'),
  })

  const { mutate: removerFoto, isPending: removendo } = useMutation({
    mutationFn: () => api.delete(`/profissionais/${profissional.id}/foto`),
    onSuccess: () => {
      setFotoUrl(null)
      qc.invalidateQueries({ queryKey: ['profissionais'] })
      qc.invalidateQueries({ queryKey: ['profissionais-todos'] })
    },
    onError: () => setErro('Não foi possível remover a foto. Tente novamente.'),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setErro('Arquivo muito grande (máx. 5MB)')
      return
    }
    enviarFoto(file)
  }

  return (
    <div className="flex flex-col items-center gap-2 pb-2">
      <div className="relative">
        <img
          src={getAvatarUrl({ ...profissional, foto_url: fotoUrl })}
          onError={(e) => { e.currentTarget.src = getAvatarFallback(profissional.nome) }}
          alt={profissional.nome}
          className="w-20 h-20 rounded-full object-cover border border-gray-100"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="absolute -bottom-1 -right-1 bg-violet-600 text-white rounded-full p-1.5 hover:bg-violet-700 disabled:opacity-50"
          title="Trocar foto"
        >
          <Camera size={14} />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {fotoUrl && (
        <button
          type="button"
          onClick={() => removerFoto()}
          disabled={removendo}
          className="text-xs text-gray-400 hover:text-red-500"
        >
          Remover foto
        </button>
      )}
      {erro && <p className="text-xs text-red-500">{erro}</p>}
    </div>
  )
}

function ProfissionalDialog({
  profissional,
  onClose,
}: {
  profissional?: Profissional
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [nome, setNome] = useState(profissional?.nome ?? '')
  const [comissao, setComissao] = useState(profissional?.comissao_percentual != null ? String(profissional.comissao_percentual) : '')

  const handleComissaoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^0-9.,]/g, '')
    setComissao(v)
  }

  const comissaoNum = comissao ? Number(comissao.replace(',', '.')) : undefined

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const body: { nome: string; comissao_percentual?: number } = { nome }
      if (comissaoNum !== undefined) body.comissao_percentual = comissaoNum
      return profissional
        ? api.patch(`/profissionais/${profissional.id}`, body)
        : api.post('/profissionais', body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profissionais'] })
      qc.invalidateQueries({ queryKey: ['profissionais-ativos'] })
      onClose()
    },
  })

  const comissaoInvalida = comissaoNum !== undefined && (comissaoNum < 0 || comissaoNum > 100)

  return (
    <div className="space-y-4 pt-2">
      {profissional && <FotoProfissional profissional={profissional} />}
      <div className="space-y-1">
        <Label>Nome do profissional</Label>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Dra. Maria Silva"
        />
      </div>
      <div className="space-y-1">
        <Label>Comissão (%)</Label>
        <Input
          type="text"
          inputMode="decimal"
          value={comissao}
          onChange={handleComissaoChange}
          placeholder="Ex: 10"
        />
        {comissaoInvalida && <p className="text-xs text-red-500">A comissão deve estar entre 0 e 100.</p>}
      </div>
      <Button onClick={() => mutate()} disabled={isPending || !nome.trim() || comissaoInvalida} className="w-full">
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
        <div className="overflow-x-auto">
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
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { Produto } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

function ProdutoDialog({ produto, onClose }: { produto?: Produto; onClose: () => void }) {
  const qc = useQueryClient()
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [categoria, setCategoria] = useState(produto?.categoria ?? '')
  const [descricao, setDescricao] = useState(produto?.descricao ?? '')
  const [fotoUrl, setFotoUrl] = useState(produto?.foto_url ?? '')

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const body = { nome, categoria, descricao, foto_url: fotoUrl }
      return produto
        ? api.patch(`/produtos/${produto.id}`, body)
        : api.post('/produtos', body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produtos'] })
      onClose()
    },
  })

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label>Nome do produto</Label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Colhedora" />
      </div>
      <div className="space-y-1">
        <Label>Categoria</Label>
        <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Implementos" />
      </div>
      <div className="space-y-1">
        <Label>Descrição</Label>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Detalhes do produto"
        />
      </div>
      <div className="space-y-1">
        <Label>URL da foto</Label>
        <Input value={fotoUrl} onChange={(e) => setFotoUrl(e.target.value)} placeholder="https://..." />
      </div>
      <Button onClick={() => mutate()} disabled={isPending} className="w-full">
        {isPending ? 'Salvando...' : produto ? 'Salvar alterações' : 'Adicionar produto'}
      </Button>
    </div>
  )
}

export function Produtos() {
  const qc = useQueryClient()
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Produto | undefined>()

  const { data: produtos = [], isLoading } = useQuery<Produto[]>({
    queryKey: ['produtos'],
    queryFn: async () => (await api.get('/produtos')).data,
  })

  const { mutate: excluir } = useMutation({
    mutationFn: (id: string) => api.delete(`/produtos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produtos'] }),
  })

  function abrirEdicao(p: Produto) {
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
        <h1 className="text-xl font-semibold text-gray-800">Produtos</h1>
        <Dialog open={dialogAberto} onOpenChange={(open) => { if (!open) fecharDialog(); else setDialogAberto(true) }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2" onClick={() => { setEditando(undefined); setDialogAberto(true) }}>
              <Plus size={15} /> Novo produto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? 'Editar produto' : 'Adicionar produto'}</DialogTitle>
            </DialogHeader>
            <ProdutoDialog produto={editando} onClose={fecharDialog} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_2px_12px_-4px_rgba(16,24,40,0.08)] border border-gray-100/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Nome</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Categoria</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Descrição</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            )}
            {produtos.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{p.nome}</td>
                <td className="px-4 py-3 text-gray-500">{p.categoria ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.descricao ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => abrirEdicao(p)} className="text-gray-400 hover:text-gray-700">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => excluir(p.id)} className="text-gray-400 hover:text-red-500">
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
    </div>
  )
}

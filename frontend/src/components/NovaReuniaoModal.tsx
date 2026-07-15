import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api } from '../api/client'
import type { Paciente, Profissional } from '../types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface NovaReuniaoModalProps {
  open: boolean
  onClose: () => void
  defaultDate?: Date
}

export function NovaReuniaoModal({ open, onClose, defaultDate }: NovaReuniaoModalProps) {
  const qc = useQueryClient()

  const [pacienteId, setPacienteId] = useState('')
  const [profissionalId, setProfissionalId] = useState('')
  const [dataHora, setDataHora] = useState('')
  const [tipo, setTipo] = useState<'presencial' | 'virtual'>('presencial')
  const [linkReuniao, setLinkReuniao] = useState('')
  const [local, setLocal] = useState('')
  const [notas, setNotas] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (open) {
      setPacienteId('')
      setProfissionalId('')
      setDataHora(defaultDate ? format(defaultDate, "yyyy-MM-dd'T'HH:mm") : '')
      setTipo('presencial')
      setLinkReuniao('')
      setLocal('')
      setNotas('')
      setErro('')
    }
  }, [open, defaultDate])

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes'],
    queryFn: async () => (await api.get('/pacientes')).data,
    enabled: open,
  })

  const { data: profissionais = [] } = useQuery<Profissional[]>({
    queryKey: ['profissionais'],
    queryFn: async () => (await api.get('/profissionais')).data,
    enabled: open,
  })

  const { mutate: criar, isPending } = useMutation({
    mutationFn: () =>
      api.post('/reunioes-agro', {
        paciente_id: pacienteId,
        profissional_id: profissionalId || null,
        data_hora: dataHora,
        tipo,
        link_reuniao: tipo === 'virtual' ? linkReuniao.trim() : null,
        local: tipo === 'presencial' ? (local.trim() || null) : null,
        notas: notas.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reunioes-agro'] })
      onClose()
    },
    onError: () => setErro('Erro ao criar reunião. Tente novamente.'),
  })

  const podeSubmeter =
    !!pacienteId && !!dataHora && (tipo !== 'virtual' || !!linkReuniao.trim())

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            🤝 Nova Reunião
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Cliente */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Cliente *
            </label>
            <select
              value={pacienteId}
              onChange={(e) => setPacienteId(e.target.value)}
              className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white ${pacienteId ? 'text-violet-700 font-medium' : 'text-gray-400'}`}
            >
              <option value="">Selecione...</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>{p.nome ?? p.telefone}</option>
              ))}
            </select>
          </div>

          {/* Vendedor */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Vendedor
            </label>
            <select
              value={profissionalId}
              onChange={(e) => setProfissionalId(e.target.value)}
              className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white ${profissionalId ? 'text-violet-700 font-medium' : 'text-gray-400'}`}
            >
              <option value="">Selecione...</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          {/* Data e hora */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Data e hora *
            </label>
            <input
              type="datetime-local"
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
              className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white ${dataHora ? 'text-violet-700 font-medium' : 'text-gray-400'}`}
            />
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Tipo *
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'presencial' | 'virtual')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white text-violet-700 font-medium"
            >
              <option value="presencial">Presencial</option>
              <option value="virtual">Virtual</option>
            </select>
          </div>

          {/* Link (virtual) ou Local (presencial) */}
          {tipo === 'virtual' ? (
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Link da reunião *
              </label>
              <Input
                value={linkReuniao}
                onChange={(e) => setLinkReuniao(e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Local (opcional)
              </label>
              <Input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex: fazenda do cliente, escritório..."
              />
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Observações (opcional)
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Notas da reunião..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white placeholder:text-gray-300 resize-none"
            />
          </div>

          {erro && <p className="text-xs text-red-500">{erro}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={onClose}
              className="border border-gray-200 text-gray-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => criar()}
              disabled={!podeSubmeter || isPending}
              className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Criando...' : 'Criar reunião'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

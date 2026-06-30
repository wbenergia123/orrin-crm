import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../api/client'
import type { Profissional } from '../types'

interface BloqueioModalProps {
  open: boolean
  profissional: Profissional
  dataInicial: Date
  onClose: () => void
  onSucesso: () => void
}

function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function toLocalIso(date: Date): string {
  return `${formatDateTimeLocal(date)}:00-03:00`
}

export function BloqueioModal({ open, profissional, dataInicial, onClose, onSucesso }: BloqueioModalProps) {
  const [inicio, setInicio] = useState(formatDateTimeLocal(dataInicial))
  const [duracaoMin, setDuracaoMin] = useState(60)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!open) return null

  const calcularFim = () => {
    const d = new Date(inicio)
    d.setMinutes(d.getMinutes() + duracaoMin)
    return formatDateTimeLocal(d)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      await api.post('/bloqueios', {
        profissional_id: profissional.id,
        data_hora_inicio: toLocalIso(new Date(inicio)),
        data_hora_fim: toLocalIso(new Date(calcularFim())),
        motivo,
      })
      onSucesso()
      onClose()
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao criar bloqueio')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Bloquear agenda</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profissional</label>
            <input
              type="text"
              value={profissional.nome}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Início</label>
            <input
              type="datetime-local"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duração (minutos)</label>
            <select
              value={duracaoMin}
              onChange={(e) => setDuracaoMin(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value={30}>30 min</option>
              <option value={60}>1 hora</option>
              <option value={90}>1h30</option>
              <option value={120}>2 horas</option>
              <option value={180}>3 horas</option>
              <option value={240}>4 horas</option>
              <option value={480}>8 horas</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={255}
              placeholder="Almoço, reunião, etc."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Bloquear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

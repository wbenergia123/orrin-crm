import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Phone, Mail, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { parseUtcTimestamp } from '../lib/utils'
import type { Paciente, StatusPaciente } from '../types'
import { StatusStepper } from './StatusStepper'
import { Button } from '@/components/ui/button'

interface Props {
  paciente: Paciente
  onClose: () => void
}

export function PatientSlidePanel({ paciente, onClose }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { mutate: updateStatus } = useMutation({
    mutationFn: (status: StatusPaciente) =>
      api.patch(`/pacientes/${paciente.id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] })
    },
  })

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-100 shadow-xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-semibold text-sm">
            {(paciente.nome ?? paciente.telefone).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-800">{paciente.nome ?? 'Sem nome'}</p>
            <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
              <Phone size={11} />
              <span>{paciente.telefone}</span>
              {paciente.email && (
                <>
                  <span>·</span>
                  <Mail size={11} />
                  <span>{paciente.email}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      {/* Status stepper */}
      <div className="p-4 border-b border-gray-100">
        <StatusStepper status={paciente.status} onChange={updateStatus} />
        {paciente.ultimo_contato_at && (
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <Clock size={11} />
            Último contato:{' '}
            {format(parseUtcTimestamp(paciente.ultimo_contato_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 space-y-2">
        <Button className="w-full" onClick={() => navigate(`/pacientes/${paciente.id}`)}>
          Ver ficha completa →
        </Button>
      </div>
    </div>
  )
}

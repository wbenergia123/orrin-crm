import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Paciente } from '../types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NovoPacienteModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (paciente: Paciente) => void
}

export function NovoPacienteModal({ open, onClose, onSuccess }: NovoPacienteModalProps) {
  const qc = useQueryClient()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () =>
      api.post<Paciente>('/pacientes', {
        telefone: telefone.trim(),
        ...(nome.trim() ? { nome: nome.trim() } : {}),
        ...(cpf.trim() ? { cpf: cpf.replace(/\D/g, '') } : {}),
        ...(dataNascimento ? { data_nascimento: dataNascimento } : {}),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pacientes-kanban'] })
      setNome('')
      setTelefone('')
      setCpf('')
      setDataNascimento('')
      reset()
      onSuccess(res.data)
      onClose()
    },
  })

  function handleClose() {
    setNome('')
    setTelefone('')
    setCpf('')
    setDataNascimento('')
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo Paciente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Maria Silva"
            />
          </div>
          <div className="space-y-1">
            <Label>Telefone (WhatsApp) *</Label>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex: 5511999990000"
            />
            <p className="text-xs text-gray-400">Incluir código do país (55) e DDD</p>
          </div>
          <div className="space-y-1">
            <Label>CPF</Label>
            <Input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
            />
          </div>
          <div className="space-y-1">
            <Label>Data de nascimento</Label>
            <Input
              type="date"
              value={dataNascimento}
              onChange={(e) => setDataNascimento(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-xs text-red-500">
              {(error as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Erro ao cadastrar.'}
            </p>
          )}
          <Button
            onClick={() => mutate()}
            disabled={isPending || !telefone.trim()}
            className="w-full"
          >
            {isPending ? 'Cadastrando...' : 'Cadastrar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

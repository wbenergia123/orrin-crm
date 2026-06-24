import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

type Aba = 'whatsapp' | 'clinica' | 'followup'

interface Configuracao {
  chave: string
  valor: string
  updated_at: string
}

interface FollowupRegra {
  id: string
  nome: string
  gatilho: string
  delay_minutos: number | null
  template: string
  ativo: boolean
  ordem_prioridade: number
}

interface WhatsappStatus {
  state: 'connected' | 'connecting' | 'disconnected'
  phone?: string
  error?: boolean | string
}

interface WhatsappConnectResponse {
  qrcode?: string
  base64?: string
  code?: string
}

function useConfiguracoes() {
  return useQuery<Configuracao[]>({
    queryKey: ['configuracoes'],
    queryFn: async () => {
      const res = await api.get('/configuracoes')
      return res.data.configuracoes
    },
  })
}

function useWhatsappStatus() {
  return useQuery<WhatsappStatus>({
    queryKey: ['whatsapp-status'],
    queryFn: async () => (await api.get('/whatsapp/status')).data,
    refetchInterval: 10_000,
  })
}

function useFollowupRegras() {
  return useQuery<FollowupRegra[]>({
    queryKey: ['followup-regras'],
    queryFn: async () => (await api.get('/followup/regras')).data,
  })
}

function getValor(configs: Configuracao[], chave: string): string {
  return configs.find((c) => c.chave === chave)?.valor ?? ''
}

export function Configuracoes() {
  const [aba, setAba] = useState<Aba>('whatsapp')
  const qc = useQueryClient()

  const { data: configs = [] } = useConfiguracoes()
  const { data: wpStatus } = useWhatsappStatus()

  // Aba Clínica
  const [clinica, setClinica] = useState({ nome: '', endereco: '', telefone: '', horario: '' })

  useEffect(() => {
    setClinica({
      nome: getValor(configs, 'nome_clinica'),
      endereco: getValor(configs, 'endereco_clinica'),
      telefone: getValor(configs, 'telefone_clinica'),
      horario: getValor(configs, 'horario_clinica'),
    })
  }, [configs])

  const salvarClinica = useMutation({
    mutationFn: async () => {
      await Promise.all([
        api.patch('/configuracoes/nome_clinica', { valor: clinica.nome }),
        api.patch('/configuracoes/endereco_clinica', { valor: clinica.endereco }),
        api.patch('/configuracoes/telefone_clinica', { valor: clinica.telefone }),
        api.patch('/configuracoes/horario_clinica', { valor: clinica.horario }),
      ])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configuracoes'] }),
  })

  // Aba Follow-up
  const { data: regras = [], isLoading: carregandoRegras } = useFollowupRegras()
  const [regrasEditadas, setRegrasEditadas] = useState<Record<string, string>>({})

  useEffect(() => {
    const map: Record<string, string> = {}
    regras.forEach((r) => { map[r.id] = r.template })
    setRegrasEditadas(map)
  }, [regras])

  const salvarRegra = useMutation({
    mutationFn: ({ id, template, ativo }: { id: string; template: string; ativo: boolean }) =>
      api.patch(`/followup/regras/${id}`, { template, ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followup-regras'] }),
  })

  const toggleFollowupAtivo = useMutation({
    mutationFn: (ativo: boolean) => api.patch('/configuracoes/followup_ativo', { valor: String(ativo) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configuracoes'] }),
  })

  // Aba WhatsApp
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrExpirado, setQrExpirado] = useState(false)

  const conectar = useMutation({
    mutationFn: async (): Promise<WhatsappConnectResponse> =>
      (await api.post('/whatsapp/connect')).data,
    onSuccess: (data) => {
      const qr = data.qrcode ?? data.base64 ?? data.code ?? null
      setQrCode(qr)
      setQrExpirado(false)
      setTimeout(() => setQrExpirado(true), 2 * 60 * 1000)
    },
  })

  const desconectar = useMutation({
    mutationFn: () => api.post('/whatsapp/disconnect'),
    onSuccess: () => {
      setQrCode(null)
      qc.invalidateQueries({ queryKey: ['whatsapp-status'] })
    },
  })

  const tabClass = (t: Aba) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      aba === t
        ? 'border-violet-600 text-violet-700'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-800">Configurações</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-100 px-4">
          <button className={tabClass('whatsapp')} onClick={() => setAba('whatsapp')}>WhatsApp</button>
          <button className={tabClass('clinica')} onClick={() => setAba('clinica')}>Clínica</button>
          <button className={tabClass('followup')} onClick={() => setAba('followup')}>Follow-up</button>
        </div>

        <div className="p-6">
          {aba === 'whatsapp' && (
            <div className="space-y-6 max-w-md">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${wpStatus?.state === 'connected' ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className="text-sm font-medium text-gray-700">
                  {wpStatus?.state === 'connected' ? 'Conectado' : wpStatus?.state === 'connecting' ? 'Conectando...' : 'Desconectado'}
                </span>
                {wpStatus?.phone && (
                  <span className="text-sm text-gray-400">{wpStatus.phone}</span>
                )}
              </div>

              {wpStatus?.state === 'connected' && (
                <button
                  onClick={() => desconectar.mutate()}
                  disabled={desconectar.isPending}
                  className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {desconectar.isPending ? 'Desconectando...' : 'Desconectar'}
                </button>
              )}

              {wpStatus?.state !== 'connected' && (
                <div className="space-y-4">
                  {qrCode && !qrExpirado ? (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">
                        Abra o WhatsApp → Aparelhos conectados → Conectar aparelho → escanear QR code
                      </p>
                      <img
                        src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                        alt="QR Code WhatsApp"
                        className="w-48 h-48 border border-gray-200 rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {qrExpirado && (
                        <p className="text-xs text-amber-600">QR code expirado. Gere um novo.</p>
                      )}
                      <button
                        onClick={() => conectar.mutate()}
                        disabled={conectar.isPending}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {conectar.isPending ? 'Gerando QR...' : qrExpirado ? 'Gerar novo QR' : 'Conectar ao WhatsApp'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {aba === 'clinica' && (
            <div className="space-y-4 max-w-md">
              {[
                { label: 'Nome da Clínica', key: 'nome' as const },
                { label: 'Endereço', key: 'endereco' as const },
                { label: 'Telefone', key: 'telefone' as const },
                { label: 'Horário de Funcionamento', key: 'horario' as const, placeholder: 'Ex: Seg–Sex 9h–18h' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder={placeholder ?? label}
                    value={clinica[key]}
                    onChange={(e) => setClinica((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <button
                onClick={() => salvarClinica.mutate()}
                disabled={salvarClinica.isPending}
                className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {salvarClinica.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              {salvarClinica.isSuccess && (
                <p className="text-xs text-green-600">Dados salvos com sucesso.</p>
              )}
            </div>
          )}

          {aba === 'followup' && (
            <div className="space-y-6 max-w-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Follow-up automático</p>
                  <p className="text-xs text-gray-400">Dispara mensagens automáticas para pacientes</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={getValor(configs, 'followup_ativo') !== 'false'}
                    onChange={(e) => toggleFollowupAtivo.mutate(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600" />
                </label>
              </div>

              {carregandoRegras ? (
                <p className="text-sm text-gray-400">Carregando regras...</p>
              ) : (
                <div className="space-y-4">
                  {regras.map((regra) => (
                    <div key={regra.id} className="border border-gray-100 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-800">{regra.nome}</p>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={regra.ativo}
                            onChange={(e) => salvarRegra.mutate({ id: regra.id, template: regrasEditadas[regra.id] ?? regra.template, ativo: e.target.checked })}
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600" />
                        </label>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Mensagem</p>
                        <textarea
                          className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-violet-500"
                          rows={3}
                          value={regrasEditadas[regra.id] ?? regra.template}
                          onChange={(e) => setRegrasEditadas((prev) => ({ ...prev, [regra.id]: e.target.value }))}
                        />
                      </div>
                      <button
                        onClick={() => salvarRegra.mutate({ id: regra.id, template: regrasEditadas[regra.id] ?? regra.template, ativo: regra.ativo })}
                        disabled={salvarRegra.isPending}
                        className="bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
                      >
                        {salvarRegra.isPending ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

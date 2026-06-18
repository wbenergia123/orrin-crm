import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

type Aba = 'prompt' | 'whatsapp' | 'clinica'

interface Configuracao {
  chave: string
  valor: string
  updated_at: string
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

function getValor(configs: Configuracao[], chave: string): string {
  return configs.find((c) => c.chave === chave)?.valor ?? ''
}

export function Configuracoes() {
  const [aba, setAba] = useState<Aba>('prompt')
  const qc = useQueryClient()

  const { data: configs = [] } = useConfiguracoes()
  const { data: wpStatus } = useWhatsappStatus()

  // Aba Prompt
  const [promptTexto, setPromptTexto] = useState('')
  const [promptErro, setPromptErro] = useState('')

  useEffect(() => {
    const val = getValor(configs, 'prompt_ana')
    if (val) setPromptTexto(val)
  }, [configs])

  const salvarPrompt = useMutation({
    mutationFn: () => api.patch('/configuracoes/prompt_ana', { valor: promptTexto }),
    onSuccess: () => {
      setPromptErro('')
      qc.invalidateQueries({ queryKey: ['configuracoes'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setPromptErro(err.response?.data?.error ?? 'Erro ao salvar')
    },
  })

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
          <button className={tabClass('prompt')} onClick={() => setAba('prompt')}>Prompt da Ana</button>
          <button className={tabClass('whatsapp')} onClick={() => setAba('whatsapp')}>WhatsApp</button>
          <button className={tabClass('clinica')} onClick={() => setAba('clinica')}>Clínica</button>
        </div>

        <div className="p-6">
          {aba === 'prompt' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Personalidade da Ana</p>
                <p className="text-xs text-gray-400 mb-3">
                  Este texto define a personalidade da Ana. Datas, serviços e dados dos pacientes são adicionados automaticamente pelo sistema.
                </p>
                <textarea
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-violet-500"
                  rows={14}
                  value={promptTexto}
                  onChange={(e) => setPromptTexto(e.target.value)}
                />
              </div>
              {promptErro && <p className="text-xs text-red-500">{promptErro}</p>}
              <button
                onClick={() => salvarPrompt.mutate()}
                disabled={salvarPrompt.isPending}
                className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {salvarPrompt.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              {salvarPrompt.isSuccess && (
                <p className="text-xs text-green-600">Salvo com sucesso.</p>
              )}
            </div>
          )}

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
        </div>
      </div>
    </div>
  )
}

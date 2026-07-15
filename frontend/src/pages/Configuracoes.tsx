import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import type { Injetavel, CategoriaInjetavel } from '../types'

type Aba = 'whatsapp' | 'clinica' | 'followup' | 'injetaveis'

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
  horario_fixo: string | null
  template: string
  ativo: boolean
  ordem_prioridade: number
}

function formatarTempo(regra: FollowupRegra): string {
  if (regra.horario_fixo) return `às ${regra.horario_fixo.substring(0, 5)}`
  if (!regra.delay_minutos) return ''
  const min = regra.delay_minutos
  if (min % 1440 === 0) return `${min / 1440} dia${min / 1440 > 1 ? 's' : ''}`
  if (min % 60 === 0) return `${min / 60}h`
  return `${min} min`
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
  const { usuario } = useAuth()
  const isAgro = usuario?.vertical === 'agro'
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
  const [regrasDelay, setRegrasDelay] = useState<Record<string, number>>({})
  const [regrasEditadas, setRegrasEditadas] = useState<Record<string, string>>({})

  useEffect(() => {
    const map: Record<string, string> = {}
    regras.forEach((r) => { map[r.id] = r.template })
    setRegrasEditadas(map)
  }, [regras])

  const salvarRegra = useMutation({
    mutationFn: ({ id, template, ativo, delay_minutos }: { id: string; template: string; ativo: boolean; delay_minutos?: number }) =>
      api.patch(`/followup/regras/${id}`, { template, ativo, ...(delay_minutos !== undefined ? { delay_minutos } : {}) }),
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

  // Agente ativo (default true — valor não configurado nunca desativa quem já usa)
  const agenteAtivo = getValor(configs, 'agente_ativo') !== 'false'
  const toggleAgenteAtivo = useMutation({
    mutationFn: (ativo: boolean) => api.patch('/configuracoes/agente_ativo', { valor: String(ativo) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configuracoes'] }),
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

      <div className="bg-white rounded-2xl shadow-[0_2px_12px_-4px_rgba(16,24,40,0.08)] border border-gray-100/80">
        <div className="flex border-b border-gray-100 px-4">
          <button className={tabClass('whatsapp')} onClick={() => setAba('whatsapp')}>WhatsApp</button>
          {!isAgro && <button className={tabClass('clinica')} onClick={() => setAba('clinica')}>Clínica</button>}
          <button className={tabClass('followup')} onClick={() => setAba('followup')}>Follow-up</button>
          {!isAgro && <button className={tabClass('injetaveis')} onClick={() => setAba('injetaveis')}>Injetáveis</button>}
        </div>

        <div className="p-6">
          {aba === 'whatsapp' && (
            <div className="space-y-6 max-w-md">
              <div className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Agente automático</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {agenteAtivo
                      ? 'Ativo — responde automaticamente às mensagens recebidas'
                      : 'Desativado — mensagens são salvas, mas ninguém responde automaticamente'}
                  </p>
                </div>
                <button
                  onClick={() => toggleAgenteAtivo.mutate(!agenteAtivo)}
                  disabled={toggleAgenteAtivo.isPending}
                  role="switch"
                  aria-checked={agenteAtivo}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${agenteAtivo ? 'bg-violet-600' : 'bg-gray-300'} disabled:opacity-50`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${agenteAtivo ? 'translate-x-5' : ''}`} />
                </button>
              </div>

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
                  {regras.map((regra) => {
                    const delayEditado = regrasDelay[regra.id] ?? regra.delay_minutos ?? 60
                    return (
                    <div key={regra.id} className="border border-gray-100 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-800">
                          {regra.nome}
                          <span className="ml-2 text-xs font-normal text-gray-400">{formatarTempo(regra)}</span>
                        </p>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={regra.ativo}
                            onChange={(e) => salvarRegra.mutate({ id: regra.id, template: regrasEditadas[regra.id] ?? regra.template, ativo: e.target.checked, delay_minutos: regra.gatilho === 'pos_atendimento' ? delayEditado : undefined })}
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600" />
                        </label>
                      </div>
                      {regra.gatilho === 'pos_atendimento' && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Enviar após o atendimento</p>
                          <select
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            value={delayEditado}
                            onChange={(e) => setRegrasDelay((prev) => ({ ...prev, [regra.id]: Number(e.target.value) }))}
                          >
                            <option value={60}>1 hora</option>
                            <option value={120}>2 horas</option>
                            <option value={180}>3 horas</option>
                            <option value={240}>4 horas</option>
                          </select>
                        </div>
                      )}
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
                        onClick={() => salvarRegra.mutate({ id: regra.id, template: regrasEditadas[regra.id] ?? regra.template, ativo: regra.ativo, delay_minutos: regra.gatilho === 'pos_atendimento' ? delayEditado : undefined })}
                        disabled={salvarRegra.isPending}
                        className="bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
                      >
                        {salvarRegra.isPending ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {aba === 'injetaveis' && <InjetaveisManager />}
        </div>
      </div>
    </div>
  )
}

const CATEGORIAS_INJETAVEIS: { value: CategoriaInjetavel; label: string }[] = [
  { value: 'botox', label: 'Botox' },
  { value: 'filler', label: 'Filler' },
  { value: 'pdo_wire', label: 'Fio de PDO' },
  { value: 'bioestimulador', label: 'Bioestimulador' },
  { value: 'bioremodelador', label: 'Bioremodelador' },
  { value: 'skinbooster', label: 'Skinbooster' },
  { value: 'enzimas', label: 'Enzimas' },
  { value: 'outro', label: 'Outro' },
]

function formatarCusto(v: string) {
  return v.replace(/[^0-9.,]/g, '')
}

function InjetaveisManager() {
  const qc = useQueryClient()
  const [editando, setEditando] = useState<Injetavel | null>(null)
  const [form, setForm] = useState({ nome: '', categoria: 'botox' as CategoriaInjetavel, cor_hex: '#7c3aed', unidade: '', custo: '' })

  const { data: injetaveis = [], isLoading } = useQuery<Injetavel[]>({
    queryKey: ['injetaveis'],
    queryFn: async () => (await api.get('/injetaveis')).data,
  })

  const criar = useMutation({
    mutationFn: () =>
      api.post('/injetaveis', {
        nome: form.nome,
        categoria: form.categoria,
        cor_hex: form.cor_hex,
        unidade: form.unidade,
        custo: form.custo ? Number(form.custo.replace(',', '.')) : 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['injetaveis'] })
      setForm({ nome: '', categoria: 'botox', cor_hex: '#7c3aed', unidade: '', custo: '' })
    },
  })

  const atualizar = useMutation({
    mutationFn: () =>
      api.patch(`/injetaveis/${editando!.id}`, {
        nome: form.nome,
        categoria: form.categoria,
        cor_hex: form.cor_hex,
        unidade: form.unidade,
        custo: form.custo ? Number(form.custo.replace(',', '.')) : 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['injetaveis'] })
      setEditando(null)
      setForm({ nome: '', categoria: 'botox', cor_hex: '#7c3aed', unidade: '', custo: '' })
    },
  })

  const desativar = useMutation({
    mutationFn: (id: string) => api.delete(`/injetaveis/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['injetaveis'] }),
  })

  function iniciarEdicao(item: Injetavel) {
    setEditando(item)
    setForm({
      nome: item.nome,
      categoria: item.categoria,
      cor_hex: item.cor_hex,
      unidade: item.unidade,
      custo: item.custo != null ? String(item.custo) : '',
    })
  }

  function cancelarEdicao() {
    setEditando(null)
    setForm({ nome: '', categoria: 'botox', cor_hex: '#7c3aed', unidade: '', custo: '' })
  }

  const submit = () => {
    if (editando) atualizar.mutate()
    else criar.mutate()
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Botox 100UI"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Categoria</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
            value={form.categoria}
            onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as CategoriaInjetavel }))}
          >
            {CATEGORIAS_INJETAVEIS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Cor</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.cor_hex}
              onChange={(e) => setForm((f) => ({ ...f, cor_hex: e.target.value }))}
              className="w-10 h-10 p-0 border border-gray-200 rounded-lg overflow-hidden"
            />
            <span className="text-xs text-gray-500">{form.cor_hex}</span>
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Unidade</label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={form.unidade}
            onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}
            placeholder="Ex: unidade / ml"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Custo (R$)</label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={form.custo}
            onChange={(e) => setForm((f) => ({ ...f, custo: formatarCusto(e.target.value) }))}
            placeholder="0,00"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!form.nome.trim() || criar.isPending || atualizar.isPending}
          className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {criar.isPending || atualizar.isPending ? 'Salvando...' : editando ? 'Salvar alterações' : 'Adicionar injetável'}
        </button>
        {editando && (
          <button
            onClick={cancelarEdicao}
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Carregando injetáveis...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="py-2 text-xs font-medium text-gray-400 uppercase">Nome</th>
                <th className="py-2 text-xs font-medium text-gray-400 uppercase">Categoria</th>
                <th className="py-2 text-xs font-medium text-gray-400 uppercase">Unidade</th>
                <th className="py-2 text-xs font-medium text-gray-400 uppercase">Custo</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {injetaveis.filter((i) => i.ativo).map((item) => (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="py-2 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: item.cor_hex }} />
                    {item.nome}
                  </td>
                  <td className="py-2 text-gray-500 capitalize">{item.categoria.replace('_', ' ')}</td>
                  <td className="py-2 text-gray-500">{item.unidade || '—'}</td>
                  <td className="py-2 text-gray-500">
                    {item.custo != null && item.custo > 0
                      ? `R$ ${Number(item.custo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => iniciarEdicao(item)}
                        className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => desativar.mutate(item.id)}
                        className="text-xs text-red-500 hover:text-red-600 font-medium"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

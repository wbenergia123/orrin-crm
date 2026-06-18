import { useState, useEffect, useRef, memo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bot, User, Send } from 'lucide-react'
import { api } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import type { StatusPaciente } from '../types'

interface AtendimentoResumo {
  id: string
  nome: string | null
  telefone: string
  status: StatusPaciente
  modo_humano: boolean
  ultima_mensagem_preview: string
  ultima_mensagem_paciente_at: string | null
  nao_lidas: boolean
  unread_count: number
}

interface Conversa {
  id: string
  mensagem_paciente: string | null
  mensagem_agente: string | null
  tipo_remetente: 'humano' | 'agente' | null
  modo_humano: boolean
  created_at: string
}

type FiltroModo = 'todos' | 'agente' | 'humano'

// Avatar com gradiente único por nome
const GRADIENTS = [
  ['#7c3aed', '#a855f7'],
  ['#2563eb', '#60a5fa'],
  ['#059669', '#34d399'],
  ['#dc2626', '#f87171'],
  ['#d97706', '#fbbf24'],
  ['#0891b2', '#22d3ee'],
  ['#be185d', '#f472b6'],
  ['#4f46e5', '#818cf8'],
]

function avatarGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h)
  const [a, b] = GRADIENTS[Math.abs(h) % GRADIENTS.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

function tempoRelativo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Agora'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return format(new Date(iso), 'd MMM', { locale: ptBR })
}

function getInitials(nome: string | null, telefone: string): string {
  if (nome) {
    const parts = nome.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return parts[0].substring(0, 2).toUpperCase()
  }
  // Phone: show last 2 digits (more unique than first 2 which are always "55")
  const digits = telefone.replace(/\D/g, '')
  return digits.slice(-2)
}

function AvatarFallback({ nome, telefone, size }: { nome: string | null; telefone: string; size: number }) {
  const seed = nome ?? telefone
  const initials = getInitials(nome, telefone)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarGradient(seed), flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: 'white',
    }}>
      {initials}
    </div>
  )
}

const Avatar = memo(function Avatar({ nome, telefone, size = 42 }: { nome: string | null; telefone: string; size?: number }) {
  const { data } = useQuery({
    queryKey: ['contact-photo', telefone],
    queryFn: async () => {
      const res = await api.get(`/whatsapp/contact-photo?phone=${telefone}`)
      return res.data as { image: string; name: string }
    },
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  const photoUrl = data?.image || ''

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={nome ?? telefone}
        width={size}
        height={size}
        style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
    )
  }

  return <AvatarFallback nome={nome} telefone={telefone} size={size} />
})

export function Atendimentos() {
  const qc = useQueryClient()
  const [selecionado, setSelecionado] = useState<AtendimentoResumo | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroModo>('todos')
  const [texto, setTexto] = useState('')
  const chatRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const pacienteIdParam = searchParams.get('paciente')

  const { data: atendimentos = [] } = useQuery<AtendimentoResumo[]>({
    queryKey: ['atendimentos-resumo', busca],
    queryFn: async () => {
      const params = busca.trim() ? `?busca=${encodeURIComponent(busca)}` : ''
      return (await api.get(`/atendimentos/resumo${params}`)).data
    },
    refetchInterval: 5_000,
  })

  const { data: conversas = [] } = useQuery<Conversa[]>({
    queryKey: ['conversas', selecionado?.id],
    queryFn: async () =>
      (await api.get(`/atendimentos/${selecionado!.id}/conversas`)).data,
    enabled: !!selecionado,
    refetchInterval: 5_000,
  })

  const listaFiltrada = atendimentos.filter((a) => {
    if (filtro === 'agente') return !a.modo_humano
    if (filtro === 'humano') return a.modo_humano
    return true
  })

  const totalNaoLidas = atendimentos.filter((a) => a.nao_lidas).length

  useEffect(() => {
    setSelecionado((prev) => {
      if (!prev) return prev
      return atendimentos.find((a) => a.id === prev.id) ?? prev
    })
  }, [atendimentos])

  // Auto-seleciona paciente quando vem de /agenda via ?paciente=ID
  useEffect(() => {
    if (!pacienteIdParam || atendimentos.length === 0) return
    const encontrado = atendimentos.find((a) => a.id === pacienteIdParam)
    if (encontrado) setSelecionado(encontrado)
  }, [pacienteIdParam, atendimentos])

  useEffect(() => {
    const el = chatRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    if (isAtBottom) el.scrollTop = el.scrollHeight
  }, [conversas])

  const { mutate: toggleHandoff } = useMutation({
    mutationFn: ({ pacienteId, modoHumano }: { pacienteId: string; modoHumano: boolean }) =>
      api.patch(`/atendimentos/${pacienteId}/handoff`, { modo_humano: modoHumano }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['atendimentos-resumo'] })
      qc.invalidateQueries({ queryKey: ['conversas', selecionado?.id] })
    },
  })

  const { mutate: enviar, isPending: enviando } = useMutation({
    mutationFn: () =>
      api.post(`/atendimentos/${selecionado!.id}/mensagem`, { texto }),
    onSuccess: () => {
      setTexto('')
      qc.invalidateQueries({ queryKey: ['conversas', selecionado?.id] })
      qc.invalidateQueries({ queryKey: ['atendimentos-resumo'] })
    },
  })

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

      {/* ── Lista esquerda ── */}
      <div className="w-[320px] min-w-[280px] border-r border-gray-100 flex flex-col">

        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Conversas</h2>
            {totalNaoLidas > 0 && (
              <span className="bg-violet-600 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[22px] text-center">
                {totalNaoLidas}
              </span>
            )}
          </div>

          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-violet-400 focus:bg-white placeholder:text-gray-400 transition-colors"
              placeholder="Buscar conversas ou contatos..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="flex gap-1.5">
            {([
              { key: 'todos', label: 'Todas' },
              { key: 'agente', label: 'IA', icon: <Bot size={11} /> },
              { key: 'humano', label: 'Humano', icon: <User size={11} /> },
            ] as { key: FiltroModo; label: string; icon?: React.ReactNode }[]).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setFiltro(key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filtro === key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {icon}{label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listaFiltrada.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10">Nenhuma conversa</p>
          )}
          {listaFiltrada.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelecionado(a)}
              className={`w-full text-left px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                selecionado?.id === a.id ? 'bg-violet-50 border-l-[3px] border-l-violet-500' : 'border-l-[3px] border-l-transparent'
              }`}
            >
              <div className="relative shrink-0 mt-0.5">
                <Avatar nome={a.nome} telefone={a.telefone} size={44} />
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#25D366] border-[2px] border-white flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="white" style={{ width: 9, height: 9 }}>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className={`text-[13px] truncate ${a.nao_lidas ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {a.nome ?? a.telefone}
                  </span>
                  <span className="text-[11px] text-gray-400 shrink-0">{tempoRelativo(a.ultima_mensagem_paciente_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <p className={`text-xs truncate ${a.nao_lidas ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                    {a.ultima_mensagem_preview || a.telefone}
                  </p>
                  {a.nao_lidas && a.unread_count > 0 && (
                    <span className="bg-[#25D366] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                      {a.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Chat direito ── */}
      {!selecionado ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#f0f2f5]">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-gray-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <p className="text-sm text-gray-400">Selecione uma conversa para ver o chat</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header */}
          <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3 bg-[#f0f2f5]">
            <Avatar nome={selecionado.nome} telefone={selecionado.telefone} size={40} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {selecionado.nome ?? selecionado.telefone}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={selecionado.status} />
                <span className={`flex items-center gap-1 text-xs font-medium ${selecionado.modo_humano ? 'text-purple-600' : 'text-blue-500'}`}>
                  {selecionado.modo_humano ? <User size={11} /> : <Bot size={11} />}
                  {selecionado.modo_humano ? 'Humano' : 'Agente'}
                </span>
              </div>
            </div>
            <button
              onClick={() => toggleHandoff({ pacienteId: selecionado.id, modoHumano: !selecionado.modo_humano })}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selecionado.modo_humano
                  ? 'border border-gray-300 text-gray-600 bg-white hover:bg-gray-50'
                  : 'bg-violet-600 text-white hover:bg-violet-700'
              }`}
            >
              {selecionado.modo_humano ? 'Devolver para Ana' : 'Assumir'}
            </button>
          </div>

          {/* Mensagens — fundo estilo WhatsApp */}
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto p-4 space-y-1"
            style={{ background: '#efeae2' }}
          >
            {conversas.map((c) => {
              const isHandoff = !c.mensagem_paciente && c.mensagem_agente?.startsWith('[HANDOFF')

              return (
                <div key={c.id}>

                  {/* Pill de sistema (handoff) */}
                  {isHandoff && (
                    <div className="flex justify-center py-2">
                      <span className="text-[11px] text-gray-500 bg-white/70 rounded-full px-3 py-1 shadow-sm">
                        {c.modo_humano ? '🙋 Secretária assumiu o atendimento' : '🤖 Ana retomou o atendimento'}
                      </span>
                    </div>
                  )}

                  {/* Mensagem do paciente — ESQUERDA, branco */}
                  {c.mensagem_paciente && (
                    <div className="flex justify-start mb-1">
                      <div className="max-w-[72%]">
                        <div className="bg-white rounded-lg rounded-tl-none px-3.5 py-2 shadow-sm relative">
                          <div className="absolute -left-2 top-0 w-0 h-0" style={{
                            borderRight: '8px solid white', borderTop: '8px solid transparent',
                          }} />
                          <p className="text-[13.5px] text-gray-900 leading-relaxed">{c.mensagem_paciente}</p>
                          <p className="text-[11px] text-gray-400 text-right mt-0.5">{format(new Date(c.created_at), 'HH:mm')}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mensagem da Ana ou operador — DIREITA, verde */}
                  {c.mensagem_agente && !isHandoff && (() => {
                    const isHumano = c.tipo_remetente === 'humano'
                    const bgColor = isHumano ? '#d1fae5' : '#d9fdd3'
                    return (
                      <div className="flex justify-end mb-1">
                        <div className="max-w-[72%]">
                          <div className="rounded-lg rounded-tr-none px-3.5 py-2 shadow-sm relative" style={{ backgroundColor: bgColor }}>
                            <div className="absolute -right-2 top-0 w-0 h-0" style={{
                              borderLeft: `8px solid ${bgColor}`, borderTop: '8px solid transparent',
                            }} />
                            <p className="text-[11px] font-semibold mb-0.5" style={{ color: isHumano ? '#065f46' : '#075e54' }}>
                              {isHumano ? 'Você' : 'Ana ✨'}
                            </p>
                            <p className="text-[13.5px] text-gray-900 leading-relaxed">{c.mensagem_agente}</p>
                            <p className="text-[11px] text-gray-500 text-right mt-0.5 flex items-center justify-end gap-1">
                              {format(new Date(c.created_at), 'HH:mm')}
                              <svg viewBox="0 0 18 18" fill="#53bdeb" style={{ width: 14, height: 14 }}>
                                <path d="M17.394 5.035l-.57-.444a.434.434 0 00-.609.076L8.397 15.484l-4.181-3.32a.43.43 0 00-.609.065l-.479.602a.431.431 0 00.066.609l4.918 3.905a.43.43 0 00.609-.065l8.812-11.438a.428.428 0 00-.139-.807z"/>
                                <path d="M12.694 5.035l-.57-.444a.434.434 0 00-.609.076L5.97 12.15a.428.428 0 00.066.608l.479.602a.43.43 0 00.609-.066l5.639-7.651a.427.427 0 00-.069-.608z"/>
                              </svg>
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                </div>
              )
            })}
          </div>

          {/* Campo de envio */}
          <div className="px-4 py-2.5 bg-[#f0f2f5] flex gap-2 items-center">
            <input
              className="flex-1 bg-white border-0 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm"
              placeholder={
                selecionado.modo_humano
                  ? 'Digite uma mensagem...'
                  : 'Modo IA — clique em Assumir para responder'
              }
              disabled={!selecionado.modo_humano}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && texto.trim() && selecionado.modo_humano && !enviando) {
                  e.preventDefault()
                  enviar()
                }
              }}
            />
            <button
              onClick={() => enviar()}
              disabled={!selecionado.modo_humano || !texto.trim() || enviando}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: selecionado.modo_humano && texto.trim() ? '#25D366' : '#aaa' }}
            >
              <Send size={17} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

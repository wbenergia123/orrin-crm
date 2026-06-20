// frontend/src/components/marcacao/MarcacaoDigital.tsx
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Eye, EyeOff, User, Loader2 } from 'lucide-react'
import { api } from '../../api/client'
import type { Injetavel, InjectionMarking, FotoPaciente, Atendimento, ViewType } from '../../types'
import { BodyMapSVG } from './BodyMapSVG'
import { MarkingEditor } from './MarkingEditor'
import { MarkingList } from './MarkingList'
import { BeforeAfterSlider } from './BeforeAfterSlider'
import { SessionHistory } from './SessionHistory'

interface MarcacaoDigitalProps {
  pacienteId: string
}

const FACE_VIEWS: { type: ViewType; label: string }[] = [
  { type: 'face_front', label: 'Frontal' },
  { type: 'face_left', label: 'Perfil Esq.' },
  { type: 'face_right', label: 'Perfil Dir.' },
]

const BODY_VIEWS: { type: ViewType; label: string }[] = [
  { type: 'body_front', label: 'Frontal' },
  { type: 'body_back', label: 'Posterior' },
]

export function MarcacaoDigital({ pacienteId }: MarcacaoDigitalProps) {
  const queryClient = useQueryClient()

  // ── Estado local ──
  const [modo, setModo] = useState<'face' | 'corpo'>('face')
  const [viewType, setViewType] = useState<ViewType>('face_front')
  const [showQuantities, setShowQuantities] = useState(false)
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)
  const [compareVisitId, setCompareVisitId] = useState<string | null>(null)
  const [antesId, setAntesId] = useState<string | undefined>()
  const [depoisId, setDepoisId] = useState<string | undefined>()

  // ── Queries ──
  const { data: injetaveis = [] } = useQuery<Injetavel[]>({
    queryKey: ['injetaveis'],
    queryFn: async () => (await api.get('/injetaveis')).data,
  })

  const { data: atendimentos = [] } = useQuery<Atendimento[]>({
    queryKey: ['atendimentos', pacienteId],
    queryFn: async () => (await api.get(`/marcacoes/atendimentos/${pacienteId}`)).data,
  })

  // Atendimento atual = o mais recente em_andamento, ou cria um novo ao salvar
  const currentVisit = atendimentos.find((a) => a.status === 'em_andamento') ?? atendimentos[0]
  const currentVisitId = currentVisit?.id ?? ''

  const { data: currentMarkings = [] } = useQuery<InjectionMarking[]>({
    queryKey: ['markings', currentVisitId],
    queryFn: async () => (await api.get(`/marcacoes/${currentVisitId}`)).data,
    enabled: !!currentVisitId,
  })

  const { data: compareMarkings = [] } = useQuery<InjectionMarking[]>({
    queryKey: ['markings', compareVisitId],
    queryFn: async () => (await api.get(`/marcacoes/${compareVisitId}`)).data,
    enabled: !!compareVisitId,
  })

  const { data: fotos = [] } = useQuery<FotoPaciente[]>({
    queryKey: ['fotos', pacienteId],
    queryFn: async () => (await api.get(`/marcacoes/fotos/${pacienteId}`)).data,
  })

  // ── Mutations ──
  const addMarking = useMutation({
    mutationFn: async (data: { visit_id: string; paciente_id: string; view_type: ViewType; x: number; y: number; product_id: string; quantity: number; unit: string; lot_id?: string }) =>
      (await api.post('/marcacoes', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markings', currentVisitId] })
      queryClient.invalidateQueries({ queryKey: ['all-markings', pacienteId] })
    },
  })

  const removeMarking = useMutation({
    mutationFn: async (id: string) => api.delete(`/marcacoes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markings', currentVisitId] })
      queryClient.invalidateQueries({ queryKey: ['all-markings', pacienteId] })
    },
  })

  const saveProtocolo = useMutation({
    mutationFn: async () => {
      // Marca o atendimento como concluido
      if (currentVisitId) {
        await api.patch(`/marcacoes/atendimentos/${currentVisitId}`, { status: 'concluido' })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['markings', currentVisitId] })
    },
  })

  // ── Handlers ──
  const handleMapClick = useCallback((x: number, y: number) => {
    setPendingPos({ x, y })
  }, [])

  const handleSaveMarking = useCallback(
    (data: { product_id: string; quantity: number; unit: string; lot_id?: string }) => {
      if (!currentVisitId) return
      addMarking.mutate({
        visit_id: currentVisitId,
        paciente_id: pacienteId,
        view_type: viewType,
        x: pendingPos!.x,
        y: pendingPos!.y,
        ...data,
      })
      setPendingPos(null)
    },
    [currentVisitId, pacienteId, viewType, pendingPos, addMarking]
  )

  const handleModoChange = (newModo: 'face' | 'corpo') => {
    setModo(newModo)
    setViewType(newModo === 'face' ? 'face_front' : 'body_front')
    setPendingPos(null)
  }

  const handleViewChange = (vt: ViewType) => {
    setViewType(vt)
    setPendingPos(null)
  }

  // Marcações para exibir no mapa atual
  const markingsForView = currentMarkings.filter((m) => m.view_type === viewType)
  const compareForView = compareMarkings.filter((m) => m.view_type === viewType)

  // Formatar markings para o BodyMapSVG
  const formatMarkings = (markings: InjectionMarking[]) =>
    markings.map((m) => ({
      id: m.id,
      x: m.x,
      y: m.y,
      cor_hex: m.injetaveis?.cor_hex ?? '#f59e0b',
      produto_nome: m.injetaveis?.nome ?? 'Produto',
      quantity: m.quantity,
      unit: m.injetaveis?.unidade ?? m.unit,
    }))

  // Marcador especial para marcações de comparação (semi-transparente)
  const compareFormatted = compareForView.map((m) => ({
    ...formatMarkings([m])[0],
    cor_hex: m.injetaveis?.cor_hex ?? '#94a3b8',
  }))

  const views = modo === 'face' ? FACE_VIEWS : BODY_VIEWS
  const isSaving = saveProtocolo.isPending

  return (
    <div className="space-y-5">
      {/* ── Controles do topo ── */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between flex-wrap gap-3">
        {/* Toggle Face/Corpo */}
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => handleModoChange('face')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              modo === 'face' ? 'bg-amber-50 text-amber-600' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Face
          </button>
          <button
            onClick={() => handleModoChange('corpo')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors border-l border-gray-200 ${
              modo === 'corpo' ? 'bg-amber-50 text-amber-600' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Corpo
          </button>
        </div>

        {/* Thumbnails de vistas */}
        <div className="flex gap-1.5">
          {views.map((v) => (
            <button
              key={v.type}
              onClick={() => handleViewChange(v.type)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                viewType === v.type
                  ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Toggle exibir quantidades */}
        <button
          onClick={() => setShowQuantities(!showQuantities)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            showQuantities
              ? 'bg-amber-50 text-amber-600 border-amber-200'
              : 'text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {showQuantities ? <Eye size={14} /> : <EyeOff size={14} />}
          Exibir quantidades
        </button>
      </div>

      {/* ── Histórico de sessões ── */}
      {atendimentos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <SessionHistory
            sessions={atendimentos}
            currentVisitId={currentVisitId}
            compareVisitId={compareVisitId}
            onSelectCompare={setCompareVisitId}
          />
        </div>
      )}

      {/* ── Mapa + Lista de marcações ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* Mapa SVG */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 relative">
          <div className="relative">
            <BodyMapSVG
              viewType={viewType}
              markings={formatMarkings(markingsForView)}
              onAddMarking={handleMapClick}
              onMarkingClick={(id: string) => {
                removeMarking.mutate(id)
              }}
              showQuantities={showQuantities}
            />
            {/* Marcações de comparação sobrepostas (sempre sem quantidade) */}
            {compareFormatted.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                <BodyMapSVG
                  viewType={viewType}
                  markings={compareFormatted}
                  showQuantities={false}
                  className="opacity-40"
                />
              </div>
            )}
            {/* Editor popover */}
            {pendingPos && (
              <MarkingEditor
                x={pendingPos.x}
                y={pendingPos.y}
                injetaveis={injetaveis}
                onSave={handleSaveMarking}
                onCancel={() => setPendingPos(null)}
              />
            )}
          </div>
          {compareVisitId && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <Eye size={12} /> Exibindo marcações da sessão atual + sessão anterior sobrepostas
            </p>
          )}
        </div>

        {/* Lista lateral */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">
              Marcações da sessão
            </h3>
            <span className="text-xs text-gray-400">
              {currentMarkings.length} total
            </span>
          </div>
          <MarkingList
            markings={currentMarkings}
            onRemove={(id) => removeMarking.mutate(id)}
          />

          {/* Botão salvar protocolo */}
          {currentMarkings.length > 0 && (
            <button
              onClick={() => saveProtocolo.mutate()}
              disabled={isSaving}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-medium rounded-lg py-2.5 hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Salvar protocolo
            </button>
          )}
        </div>
      </div>

      {/* ── Comparador Antes/Depois ── */}
      <BeforeAfterSlider
        fotos={fotos}
        antesId={antesId}
        depoisId={depoisId}
        onSetAntes={setAntesId}
        onSetDepois={setDepoisId}
      />

      {/* ── Info do atendimento atual ── */}
      {currentVisit && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <User size={14} />
          Sessão atual: {new Date(currentVisit.data_atendimento).toLocaleDateString('pt-BR')}
          {currentVisit.status === 'em_andamento' && ' · Em andamento'}
        </div>
      )}
    </div>
  )
}

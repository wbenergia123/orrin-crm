// frontend/src/components/marcacao/MarcacaoDigital.tsx
import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Eye, EyeOff, User, Loader2, Image } from 'lucide-react'
import { api } from '../../api/client'
import type { Injetavel, InjectionMarking, FotoPaciente, Atendimento, ViewType, BackgroundModo, ImagemReferencia } from '../../types'
import { BodyMapSVG, type DrawTool } from './BodyMapSVG'
import { MarkingEditor } from './MarkingEditor'
import { MarkingList } from './MarkingList'
import { BeforeAfterSlider } from './BeforeAfterSlider'
import { SessionHistory } from './SessionHistory'
import { ProductSidebar } from './ProductSidebar'
import { DrawToolbar } from './DrawToolbar'
import { BackgroundPicker } from './BackgroundPicker'

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
  const [pendingPath, setPendingPath] = useState<{ x: number; y: number }[] | null>(null)
  const [tool, setTool] = useState<DrawTool>('ponto')
  const [compareVisitId, setCompareVisitId] = useState<string | null>(null)
  const [antesId, setAntesId] = useState<string | undefined>()
  const [depoisId, setDepoisId] = useState<string | undefined>()
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const prevSelectedRef = useRef<string | null>(null)

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

  const { data: imagensReferencia = [] } = useQuery<ImagemReferencia[]>({
    queryKey: ['imagens-referencia'],
    queryFn: async () => (await api.get('/imagens-referencia')).data,
  })

  // ── Sugestão de ferramenta quando seleciona produto PDO Wire ──
  useEffect(() => {
    if (selectedProductId && prevSelectedRef.current !== selectedProductId) {
      const prod = injetaveis.find((p) => p.id === selectedProductId)
      setTool(prod?.categoria === 'pdo_wire' ? 'linha' : 'ponto')
      prevSelectedRef.current = selectedProductId
    }
  }, [selectedProductId, injetaveis])

  // ── Mutations ──
  const addMarking = useMutation({
    mutationFn: async (data: {
      visit_id: string
      paciente_id: string
      view_type: ViewType
      x: number
      y: number
      tipo_desenho: DrawTool
      pontos: { x: number; y: number }[] | null
      product_id: string
      quantity: number
      unit: string
      lot_id?: string
    }) => (await api.post('/marcacoes', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markings', currentVisitId] })
      queryClient.invalidateQueries({ queryKey: ['atendimentos', pacienteId] })
    },
  })

  const removeMarking = useMutation({
    mutationFn: async (id: string) => api.delete(`/marcacoes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markings', currentVisitId] })
      queryClient.invalidateQueries({ queryKey: ['all-markings', pacienteId] })
    },
  })

  const moveMarking = useMutation({
    mutationFn: async ({ id, x, y }: { id: string; x: number; y: number }) =>
      (await api.patch(`/marcacoes/${id}`, { x, y })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markings', currentVisitId] })
    },
  })

  const saveProtocolo = useMutation({
    mutationFn: async () => {
      if (currentVisitId) {
        await api.patch(`/marcacoes/atendimentos/${currentVisitId}`, { status: 'concluido' })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['markings', currentVisitId] })
    },
  })

  const ensureVisit = useCallback(async (): Promise<string> => {
    if (currentVisitId) return currentVisitId
    const resp = await api.post('/marcacoes/atendimentos', { paciente_id: pacienteId })
    queryClient.invalidateQueries({ queryKey: ['atendimentos', pacienteId] })
    return resp.data.id
  }, [currentVisitId, pacienteId, queryClient])

  const updateBackground = useMutation({
    mutationFn: async (change: {
      background_modo?: BackgroundModo
      background_opacidade?: number
      background_foto_id?: string | null
      background_imagem_id?: string | null
    }) => {
      const visitId = await ensureVisit()
      return (await api.patch(`/marcacoes/atendimentos/${visitId}`, change)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos', pacienteId] })
    },
  })

  const uploadImagemReferencia = useMutation({
    mutationFn: async ({ file, nome }: { file: File; nome: string }) => {
      const form = new FormData()
      form.append('imagem', file)
      form.append('nome', nome)
      return (await api.post('/imagens-referencia/upload', form)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagens-referencia'] })
    },
  })

  // ── Handlers ──
  const handleMapClick = useCallback((x: number, y: number) => {
    setPendingPath([{ x, y }])
  }, [])

  const handleFinishPath = useCallback((pontos: { x: number; y: number }[]) => {
    setPendingPath(pontos)
  }, [])

  const handleSaveMarking = useCallback(
    async (data: { product_id: string; quantity: number; unit: string; lot_id?: string }) => {
      if (!pendingPath || pendingPath.length === 0) return
      let visitId: string
      try {
        visitId = await ensureVisit()
      } catch (e) {
        console.error('Erro ao criar atendimento:', e)
        return
      }

      const primeiro = pendingPath[0]
      let tipo: DrawTool = tool
      let pontos: { x: number; y: number }[] | null = null

      if (pendingPath.length === 1) {
        tipo = 'ponto'
      } else {
        pontos = pendingPath
        if (tipo !== 'linha' && tipo !== 'forma') tipo = 'linha'
      }

      addMarking.mutate({
        visit_id: visitId,
        paciente_id: pacienteId,
        view_type: viewType,
        x: primeiro.x,
        y: primeiro.y,
        tipo_desenho: tipo,
        pontos,
        ...data,
      })
      setPendingPath(null)
    },
    [ensureVisit, pacienteId, viewType, pendingPath, tool, addMarking]
  )

  const handleModoChange = (newModo: 'face' | 'corpo') => {
    setModo(newModo)
    setViewType(newModo === 'face' ? 'face_front' : 'body_front')
    setPendingPath(null)
  }

  const handleViewChange = (vt: ViewType) => {
    setViewType(vt)
    setPendingPath(null)
  }

  const updateVisitDate = useMutation({
    mutationFn: async (data_atendimento: string) =>
      (await api.patch(`/marcacoes/atendimentos/${currentVisitId}`, { data_atendimento })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimentos', pacienteId] })
    },
  })

  const uploadFoto = useMutation({
    mutationFn: async ({ file, tipo }: { file: File; tipo: 'antes' | 'depois' }) => {
      const visitId = await ensureVisit()
      const form = new FormData()
      form.append('foto', file)
      form.append('paciente_id', pacienteId)
      form.append('tipo', tipo)
      form.append('visit_id', visitId)
      return (await api.post('/marcacoes/fotos/upload', form)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fotos', pacienteId] })
    },
  })

  const deleteFoto = useMutation({
    mutationFn: async (id: string) => api.delete(`/marcacoes/fotos/${id}`),
    onSuccess: (_data, id) => {
      if (antesId === id) setAntesId(undefined)
      if (depoisId === id) setDepoisId(undefined)
      queryClient.invalidateQueries({ queryKey: ['fotos', pacienteId] })
    },
  })

  const handleBackgroundChange = useCallback(
    (change: {
      background_modo?: BackgroundModo
      background_opacidade?: number
      background_foto_id?: string | null
      background_imagem_id?: string | null
    }) => {
      updateBackground.mutate(change)
    },
    [updateBackground]
  )

  // Marcações para exibir no mapa atual
  const markingsForView = currentMarkings.filter((m) => m.view_type === viewType)
  const compareForView = compareMarkings.filter((m) => m.view_type === viewType)

  // Formatar markings para o BodyMapSVG
  const formatMarkings = (markings: InjectionMarking[]) =>
    markings.map((m) => ({
      id: m.id,
      x: m.x,
      y: m.y,
      tipo_desenho: m.tipo_desenho,
      pontos: m.pontos,
      cor_hex: m.injetaveis?.cor_hex ?? '#f59e0b',
      produto_nome: m.injetaveis?.nome ?? 'Produto',
      quantity: m.quantity,
      unit: m.injetaveis?.unidade ?? m.unit,
    }))

  const compareFormatted = compareForView.map((m) => ({
    ...formatMarkings([m])[0],
    cor_hex: m.injetaveis?.cor_hex ?? '#94a3b8',
  }))

  // Fundo customizável
  const backgroundOverride = (() => {
    if (!currentVisit || currentVisit.background_modo === 'anatomico') return undefined
    if (currentVisit.background_modo === 'foto_paciente') {
      const foto = fotos.find((f) => f.id === currentVisit.background_foto_id)
      if (!foto) return undefined
      return { url: foto.url, opacityPercent: currentVisit.background_opacidade }
    }
    if (currentVisit.background_modo === 'imagem_referencia') {
      const img = imagensReferencia.find((i) => i.id === currentVisit.background_imagem_id)
      if (!img) return undefined
      return { url: img.url, opacityPercent: currentVisit.background_opacidade }
    }
  })()

  const views = modo === 'face' ? FACE_VIEWS : BODY_VIEWS
  const isSaving = saveProtocolo.isPending
  const selectedProduct = selectedProductId ? injetaveis.find((p) => p.id === selectedProductId) : undefined

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

        {/* Ferramentas de desenho */}
        <DrawToolbar
          tool={tool}
          onChange={setTool}
          suggestedTool={selectedProduct?.categoria === 'pdo_wire' ? 'linha' : undefined}
        />

        {/* Thumbnails de vistas — escondido quando fundo customizado */}
        {(!currentVisit || currentVisit.background_modo === 'anatomico') && (
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
        )}

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
              tool={tool}
              onAddMarking={handleMapClick}
              onFinishPath={handleFinishPath}
              onMarkingClick={(id: string) => {
                removeMarking.mutate(id)
              }}
              onMoveMarking={(id, x, y) => moveMarking.mutate({ id, x, y })}
              showQuantities={showQuantities}
              backgroundOverride={backgroundOverride}
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
            {pendingPath && pendingPath.length > 0 && (
              <MarkingEditor
                x={pendingPath[0].x}
                y={pendingPath[0].y}
                injetaveis={injetaveis}
                onSave={handleSaveMarking}
                onCancel={() => setPendingPath(null)}
                lockedProduct={selectedProduct}
              />
            )}
          </div>
          {compareVisitId && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <Eye size={12} /> Exibindo marcações da sessão atual + sessão anterior sobrepostas
            </p>
          )}
          {tool === 'ponto' && markingsForView.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Arraste uma marcação pra mover de posição. Clique sem arrastar pra excluir.
            </p>
          )}
        </div>

        {/* Lista lateral */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          {/* Fundo customizável */}
          <div className="mb-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Image size={14} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-800">Fundo do diagrama</h3>
            </div>
            <BackgroundPicker
              modo={currentVisit?.background_modo ?? 'anatomico'}
              opacidade={currentVisit?.background_opacidade ?? 100}
              fotoId={currentVisit?.background_foto_id ?? null}
              imagemId={currentVisit?.background_imagem_id ?? null}
              fotos={fotos}
              imagens={imagensReferencia}
              onChange={handleBackgroundChange}
              onUploadImagem={(file, nome) => uploadImagemReferencia.mutate({ file, nome })}
              isUploading={uploadImagemReferencia.isPending}
            />
          </div>

          <ProductSidebar injetaveis={injetaveis} selectedId={selectedProductId} onSelect={setSelectedProductId} />
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

          {/* Data da sessão */}
          {currentVisit && (
            <div className="flex items-center gap-2 mt-4">
              <label className="text-xs text-gray-500">Data da sessão</label>
              <input
                type="date"
                value={currentVisit.data_atendimento.slice(0, 10)}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => updateVisitDate.mutate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              />
            </div>
          )}

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
        onUpload={(file, tipo) => uploadFoto.mutate({ file, tipo })}
        onDelete={(id) => deleteFoto.mutate(id)}
        isUploading={uploadFoto.isPending}
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

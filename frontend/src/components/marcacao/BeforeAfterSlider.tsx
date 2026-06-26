// frontend/src/components/marcacao/BeforeAfterSlider.tsx
import { useState, useRef, useCallback } from 'react'
import { ImageOff, Camera, Loader2, Trash2 } from 'lucide-react'
import { parseUtcTimestamp } from '../../lib/utils'
import type { FotoPaciente } from '../../types'

interface BeforeAfterSliderProps {
  fotos: FotoPaciente[]
  antesId?: string
  depoisId?: string
  onSetAntes?: (id: string) => void
  onSetDepois?: (id: string) => void
  onUpload: (file: File, tipo: 'antes' | 'depois') => void
  onDelete?: (id: string) => void
  isUploading: boolean
}

function UploadFoto({ onUpload, isUploading }: { onUpload: BeforeAfterSliderProps['onUpload']; isUploading: boolean }) {
  const [tipo, setTipo] = useState<'antes' | 'depois'>('antes')
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-2 mb-4">
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value as 'antes' | 'depois')}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
      >
        <option value="antes">Antes</option>
        <option value="depois">Depois</option>
      </select>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file, tipo)
          e.target.value = ''
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className="flex items-center gap-1.5 text-xs text-white bg-amber-500 rounded-lg px-3 py-1.5 hover:bg-amber-600 disabled:opacity-50"
      >
        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
        Adicionar foto
      </button>
    </div>
  )
}

export function BeforeAfterSlider({ fotos, antesId, depoisId, onSetAntes, onSetDepois, onUpload, onDelete, isUploading }: BeforeAfterSliderProps) {
  const [sliderPos, setSliderPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const fotoAntes = fotos.find((f) => f.id === antesId)
  const fotoDepois = fotos.find((f) => f.id === depoisId)

  const handleMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    setSliderPos(Math.max(0, Math.min(100, x)))
  }, [])

  const handleMouseDown = () => {
    isDragging.current = true
  }

  const handleMouseUp = () => {
    isDragging.current = false
  }

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.touches[0].clientX - rect.left) / rect.width) * 100
    setSliderPos(Math.max(0, Math.min(100, x)))
  }, [])

  if (!fotoAntes || !fotoDepois) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Comparador Antes / Depois</h3>
        <UploadFoto onUpload={onUpload} isUploading={isUploading} />
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
          <div className="text-center">
            <ImageOff size={32} className="mx-auto mb-2 opacity-40" />
            Selecione uma foto "antes" e uma "depois" abaixo para comparar.
          </div>
        </div>
        {/* Seletores de foto */}
        {fotos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <PhotoSelector
              label="Antes"
              fotos={fotos}
              selectedId={antesId}
              excludeId={depoisId}
              onSelect={onSetAntes}
              onDelete={onDelete}
            />
            <PhotoSelector
              label="Depois"
              fotos={fotos}
              selectedId={depoisId}
              excludeId={antesId}
              onSelect={onSetDepois}
              onDelete={onDelete}
            />
          </div>
        )}
        {fotos.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Nenhuma foto cadastrada para este paciente.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Comparador Antes / Depois</h3>
      <UploadFoto onUpload={onUpload} isUploading={isUploading} />

      {/* Slider */}
      <div
        ref={containerRef}
        className="relative w-full aspect-[4/3] rounded-lg overflow-hidden cursor-ew-resize select-none bg-gray-100"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleTouchMove}
      >
        {/* Foto "depois" (fundo) */}
        <img
          src={fotoDepois.url}
          alt="Depois"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
        <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
          Depois
        </span>

        {/* Foto "antes" (recortada pelo slider) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${sliderPos}%` }}
        >
          <img
            src={fotoAntes.url}
            alt="Antes"
            className="absolute inset-0 h-full object-cover"
            style={{ width: containerRef.current?.clientWidth ?? '100%', maxWidth: 'none' }}
            draggable={false}
          />
          <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
            Antes
          </span>
        </div>

        {/* Linha do slider */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-md cursor-ew-resize"
          style={{ left: `${sliderPos}%` }}
          onMouseDown={handleMouseDown}
          onTouchStart={() => { isDragging.current = true }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center">
            <div className="flex gap-0.5">
              <span className="text-gray-600 text-xs">◀</span>
              <span className="text-gray-600 text-xs">▶</span>
            </div>
          </div>
        </div>
      </div>

      {/* Seletores de foto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <PhotoSelector
          label="Antes"
          fotos={fotos}
          selectedId={antesId}
          excludeId={depoisId}
          onSelect={onSetAntes}
          onDelete={onDelete}
        />
        <PhotoSelector
          label="Depois"
          fotos={fotos}
          selectedId={depoisId}
          excludeId={antesId}
          onSelect={onSetDepois}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

function PhotoSelector({
  label,
  fotos,
  selectedId,
  excludeId,
  onSelect,
  onDelete,
}: {
  label: string
  fotos: FotoPaciente[]
  selectedId?: string
  excludeId?: string
  onSelect?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const handleDelete = () => {
    if (!selectedId) return
    if (window.confirm('Tem certeza que quer excluir essa foto?')) {
      onDelete?.(selectedId)
    }
  }

  // Esconde a foto já escolhida no outro seletor — não faz sentido usar a
  // mesma foto como "antes" e "depois" ao mesmo tempo.
  const opcoes = fotos.filter((f) => f.id !== excludeId)

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <select
          value={selectedId ?? ''}
          onChange={(e) => onSelect?.(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
        >
          <option value="">Selecionar foto...</option>
          {opcoes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.tipo === 'antes' ? '📸 ' : f.tipo === 'depois' ? '✨ ' : '🖼️ '}
              {f.legenda ?? `${f.tipo} — ${parseUtcTimestamp(f.created_at).toLocaleDateString('pt-BR')}`}
            </option>
          ))}
        </select>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={!selectedId}
            title="Excluir foto selecionada"
            className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

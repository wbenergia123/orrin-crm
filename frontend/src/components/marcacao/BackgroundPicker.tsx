// frontend/src/components/marcacao/BackgroundPicker.tsx
import { useState, useRef } from 'react'
import { Image, User, Images, Plus, Upload, X } from 'lucide-react'
import type { BackgroundModo, FotoPaciente, ImagemReferencia } from '../../types'

interface BackgroundPickerProps {
  modo: BackgroundModo
  opacidade: number
  fotoId: string | null
  imagemId: string | null
  fotos: FotoPaciente[]
  imagens: ImagemReferencia[]
  onChange: (change: {
    background_modo?: BackgroundModo
    background_opacidade?: number
    background_foto_id?: string | null
    background_imagem_id?: string | null
  }) => void
  onUploadImagem: (file: File, nome: string) => void
  isUploading?: boolean
}

const MODOS: { key: BackgroundModo; label: string; icon: typeof Image }[] = [
  { key: 'anatomico', label: 'Anatômico', icon: Image },
  { key: 'foto_paciente', label: 'Foto do paciente', icon: User },
  { key: 'imagem_referencia', label: 'Imagem de referência', icon: Images },
]

export function BackgroundPicker({
  modo,
  opacidade,
  fotoId,
  imagemId,
  fotos,
  imagens,
  onChange,
  onUploadImagem,
  isUploading,
}: BackgroundPickerProps) {
  const [showUpload, setShowUpload] = useState(false)
  const [nomeRef, setNomeRef] = useState('')
  const [fileRef, setFileRef] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleModoChange = (key: BackgroundModo) => {
    if (key === 'anatomico') {
      onChange({ background_modo: key, background_foto_id: null, background_imagem_id: null })
      return
    }
    if (key === 'foto_paciente') {
      const primeira = fotos[0]
      onChange({
        background_modo: key,
        background_foto_id: primeira?.id ?? null,
        background_imagem_id: null,
      })
      return
    }
    if (key === 'imagem_referencia') {
      const primeira = imagens[0]
      onChange({
        background_modo: key,
        background_foto_id: null,
        background_imagem_id: primeira?.id ?? null,
      })
      return
    }
  }

  const submitUpload = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fileRef || !nomeRef.trim()) return
    onUploadImagem(fileRef, nomeRef.trim())
    setShowUpload(false)
    setNomeRef('')
    setFileRef(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {MODOS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleModoChange(key)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              modo === key
                ? 'bg-amber-50 text-amber-600 border-amber-200'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {modo !== 'anatomico' && (
        <div className="flex flex-wrap items-center gap-3 bg-gray-50 rounded-lg p-3">
          <label className="text-xs text-gray-500">Opacidade</label>
          <input
            type="range"
            min={10}
            max={100}
            value={opacidade}
            onChange={(e) => onChange({ background_opacidade: Number(e.target.value) })}
            className="w-32 accent-amber-500"
          />
          <span className="text-xs text-gray-600 w-8">{opacidade}%</span>
        </div>
      )}

      {modo === 'foto_paciente' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Selecione uma foto do paciente</p>
          {fotos.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhuma foto cadastrada.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fotos.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onChange({ background_foto_id: f.id })}
                  className={`w-16 h-16 rounded-lg border overflow-hidden ${
                    fotoId === f.id ? 'ring-2 ring-amber-500 border-amber-500' : 'border-gray-200'
                  }`}
                >
                  <img src={f.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {modo === 'imagem_referencia' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-600">Selecione uma imagem da biblioteca</p>
            <button
              onClick={() => setShowUpload((s) => !s)}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
            >
              <Plus size={12} />
              Adicionar
            </button>
          </div>

          {showUpload && (
            <form onSubmit={submitUpload} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nomeRef}
                  onChange={(e) => setNomeRef(e.target.value)}
                  placeholder="Nome da referência"
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber-300"
                  required
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFileRef(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border ${
                    fileRef ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <Upload size={12} />
                  {fileRef ? '1 arquivo' : 'Escolher'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isUploading || !fileRef || !nomeRef.trim()}
                  className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {isUploading ? 'Enviando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  <X size={12} />
                </button>
              </div>
            </form>
          )}

          {imagens.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhuma imagem de referência.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {imagens.map((img) => (
                <button
                  key={img.id}
                  onClick={() => onChange({ background_imagem_id: img.id })}
                  title={img.nome}
                  className={`w-16 h-16 rounded-lg border overflow-hidden relative ${
                    imagemId === img.id ? 'ring-2 ring-amber-500 border-amber-500' : 'border-gray-200'
                  }`}
                >
                  <img src={img.url} alt={img.nome} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

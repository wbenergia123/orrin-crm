// frontend/src/components/marcacao/BodyMapSVG.tsx
// Usa imagens reais como fundo + camada SVG transparente para marcações
import { useState, useRef, useEffect } from 'react'

import faceFrontImg  from '../../assets/facemap/face_front.png'
import faceLeftImg   from '../../assets/facemap/face_left.png'
import faceRightImg  from '../../assets/facemap/face_right.png'
import bodyFrontImg  from '../../assets/facemap/body_front.png'
import bodyBackImg   from '../../assets/facemap/body_back.png'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type DrawTool = 'ponto' | 'linha' | 'forma'

export interface MarkingData {
  id: string
  x: number        // 0-100 (percentual da largura do contêiner)
  y: number        // 0-100 (percentual da altura do contêiner)
  tipo_desenho: DrawTool
  pontos: { x: number; y: number }[] | null
  cor_hex: string
  produto_nome: string
  quantity: number
  unit: string
}

export interface BackgroundOverride {
  url: string
  opacityPercent: number
}

export interface BodyMapSVGProps {
  viewType: 'face_front' | 'face_left' | 'face_right' | 'body_front' | 'body_back'
  markings: MarkingData[]
  tool?: DrawTool
  onAddMarking?: (x: number, y: number) => void
  onFinishPath?: (pontos: { x: number; y: number }[]) => void
  onMarkingClick?: (markingId: string) => void
  showQuantities?: boolean
  backgroundOverride?: BackgroundOverride
  className?: string
}

/* ------------------------------------------------------------------ */
/*  Map de imagens por vista                                             */
/* ------------------------------------------------------------------ */

const IMAGE_MAP: Record<BodyMapSVGProps['viewType'], string> = {
  face_front:  faceFrontImg,
  face_left:   faceLeftImg,
  face_right:  faceRightImg,
  body_front:  bodyFrontImg,
  body_back:   bodyBackImg,
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                                 */
/* ------------------------------------------------------------------ */

function BodyMapSVG({
  viewType,
  markings = [],
  tool = 'ponto',
  onAddMarking,
  onFinishPath,
  onMarkingClick,
  showQuantities = false,
  backgroundOverride,
  className,
}: BodyMapSVGProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([])

  // Converte coordenadas de clique para % (0-100) relativa ao container
  function getRelativePos(e: React.MouseEvent<HTMLDivElement>): { x: number; y: number } | null {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const pos = getRelativePos(e)
    if (!pos) return

    if (tool === 'ponto') {
      onAddMarking?.(pos.x, pos.y)
      return
    }

    setDrawingPoints((prev) => {
      const next = [...prev, pos!]
      // linha com 2 pontos ou forma com 3 pontos: permite finalizar, mas não fecha sozinho
      return next
    })
  }

  const handleDoubleClick = () => {
    if (tool === 'linha' && drawingPoints.length >= 2) {
      finalizePath()
    } else if (tool === 'forma' && drawingPoints.length >= 3) {
      finalizePath()
    }
  }

  const finalizePath = () => {
    if (drawingPoints.length === 0) return
    onFinishPath?.(drawingPoints)
    setDrawingPoints([])
  }

  const cancelDrawing = () => setDrawingPoints([])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const pos = getRelativePos(e)
    setHoverPos(pos)
  }

  // Esc cancela desenho em progresso
  useEffect(() => {
    if (tool === 'ponto' || drawingPoints.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDrawing()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tool, drawingPoints.length])

  const canFinish =
    (tool === 'linha' && drawingPoints.length >= 2) ||
    (tool === 'forma' && drawingPoints.length >= 3)

  const img = backgroundOverride?.url ?? IMAGE_MAP[viewType]
  const bgOpacity = backgroundOverride ? backgroundOverride.opacityPercent / 100 : 1

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        cursor: tool === 'ponto' ? (onAddMarking ? 'crosshair' : 'default') : 'crosshair',
        userSelect: 'none',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverPos(null)}
    >
      {/* ── Imagem de fundo ── */}
      <img
        src={img}
        alt={viewType}
        draggable={false}
        style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none', opacity: bgOpacity }}
      />

      {/* ── Camada SVG de marcações (posicionada sobre a imagem) ── */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Crosshair no hover */}
        {hoverPos && (onAddMarking || onFinishPath) && (
          <g opacity={0.5} stroke="#94a3b8" strokeWidth="0.3" strokeDasharray="1,1">
            <line x1={hoverPos.x} y1="0" x2={hoverPos.x} y2="100" />
            <line x1="0" y1={hoverPos.y} x2="100" y2={hoverPos.y} />
            <circle cx={hoverPos.x} cy={hoverPos.y} r="0.8" fill="#94a3b8" stroke="none" />
          </g>
        )}

        {/* Desenho em progresso */}
        {drawingPoints.length > 1 && (
          <polyline
            points={drawingPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="0.6"
            strokeDasharray="1,0.5"
          />
        )}
        {drawingPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="0.8" fill="#f59e0b" stroke="white" strokeWidth="0.3" />
        ))}

        {/* Marcações existentes */}
        {markings.map((m) => {
          const pointsAttr = (m.pontos ?? [{ x: m.x, y: m.y }])
            .map((p) => `${p.x},${p.y}`)
            .join(' ')

          return (
            <g
              key={m.id}
              style={{ cursor: onMarkingClick ? 'pointer' : 'default', pointerEvents: 'all' }}
              onClick={(e) => {
                e.stopPropagation()
                onMarkingClick?.(m.id)
              }}
            >
              {m.tipo_desenho === 'ponto' && (
                <>
                  <circle cx={m.x} cy={m.y} r="2.3" fill="rgba(0,0,0,0.12)" />
                  <circle cx={m.x} cy={m.y} r="1.8" fill={m.cor_hex} stroke="white" strokeWidth="0.6">
                    <title>{`${m.produto_nome} · ${m.quantity} ${m.unit}`}</title>
                  </circle>
                  <circle cx={m.x - 0.45} cy={m.y - 0.45} r="0.5" fill="rgba(255,255,255,0.45)" stroke="none" />
                </>
              )}

              {m.tipo_desenho === 'linha' && (
                <>
                  <polyline
                    points={pointsAttr}
                    fill="none"
                    stroke={m.cor_hex}
                    strokeWidth="0.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {(m.pontos ?? []).map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="1" fill={m.cor_hex} stroke="white" strokeWidth="0.4" />
                  ))}
                </>
              )}

              {m.tipo_desenho === 'forma' && (
                <>
                  <polygon
                    points={pointsAttr}
                    fill={m.cor_hex}
                    fillOpacity={0.25}
                    stroke={m.cor_hex}
                    strokeWidth="0.6"
                  />
                  {(m.pontos ?? []).map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="0.7" fill={m.cor_hex} stroke="white" strokeWidth="0.3" />
                  ))}
                </>
              )}

              {showQuantities && (
                <text
                  x={m.x + 4}
                  y={m.y + 1}
                  fontSize="3.5"
                  fill={m.cor_hex}
                  fontWeight="600"
                  textAnchor="start"
                  dominantBaseline="middle"
                  stroke="white"
                  strokeWidth="0.8"
                  paintOrder="stroke"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {m.quantity}{m.unit}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Controles de desenho em progresso */}
      {tool !== 'ponto' && drawingPoints.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 backdrop-blur rounded-full px-3 py-1.5 shadow-sm border border-gray-200 z-20">
          <span className="text-xs text-gray-500">
            {drawingPoints.length} ponto{drawingPoints.length > 1 ? 's' : ''}
          </span>
          {canFinish && (
            <button
              onClick={(e) => { e.stopPropagation(); finalizePath() }}
              className="text-xs bg-amber-500 text-white px-3 py-1 rounded-full hover:bg-amber-600"
            >
              Concluir
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); cancelDrawing() }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

export { BodyMapSVG }
export default BodyMapSVG

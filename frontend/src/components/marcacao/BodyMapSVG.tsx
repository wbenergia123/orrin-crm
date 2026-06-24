// frontend/src/components/marcacao/BodyMapSVG.tsx
// Usa imagens reais como fundo + camada SVG transparente para marcações
import { useState, useRef } from 'react'

import faceFrontImg  from '../../assets/facemap/face_front.png'
import faceLeftImg   from '../../assets/facemap/face_left.png'
import faceRightImg  from '../../assets/facemap/face_right.png'
import bodyFrontImg  from '../../assets/facemap/body_front.png'
import bodyBackImg   from '../../assets/facemap/body_back.png'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface MarkingData {
  id: string
  x: number        // 0-100 (percentual da largura do contêiner)
  y: number        // 0-100 (percentual da altura do contêiner)
  cor_hex: string
  produto_nome: string
  quantity: number
  unit: string
}

export interface BodyMapSVGProps {
  viewType: 'face_front' | 'face_left' | 'face_right' | 'body_front' | 'body_back'
  markings: MarkingData[]
  onAddMarking?: (x: number, y: number) => void
  onMarkingClick?: (markingId: string) => void
  showQuantities?: boolean
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
  onAddMarking,
  onMarkingClick,
  showQuantities = false,
  className,
}: BodyMapSVGProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)

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
    if (!onAddMarking) return
    const pos = getRelativePos(e)
    if (pos) onAddMarking(pos.x, pos.y)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onAddMarking) return
    const pos = getRelativePos(e)
    setHoverPos(pos)
  }

  const img = IMAGE_MAP[viewType]

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        cursor: onAddMarking ? 'crosshair' : 'default',
        userSelect: 'none',
      }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverPos(null)}
    >
      {/* ── Imagem de fundo ── */}
      <img
        src={img}
        alt={viewType}
        draggable={false}
        style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
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
        {hoverPos && onAddMarking && (
          <g opacity={0.5} stroke="#94a3b8" strokeWidth="0.3" strokeDasharray="1,1">
            <line x1={hoverPos.x} y1="0" x2={hoverPos.x} y2="100" />
            <line x1="0" y1={hoverPos.y} x2="100" y2={hoverPos.y} />
            <circle cx={hoverPos.x} cy={hoverPos.y} r="0.8" fill="#94a3b8" stroke="none" />
          </g>
        )}

        {/* Marcações existentes */}
        {markings.map((m) => (
          <g
            key={m.id}
            style={{ cursor: onMarkingClick ? 'pointer' : 'default', pointerEvents: 'all' }}
            onClick={(e) => {
              e.stopPropagation()
              onMarkingClick?.(m.id)
            }}
          >
            {/* Sombra suave */}
            <circle cx={m.x} cy={m.y} r="2.3" fill="rgba(0,0,0,0.12)" />
            {/* Ponto principal */}
            <circle
              cx={m.x}
              cy={m.y}
              r="1.8"
              fill={m.cor_hex}
              stroke="white"
              strokeWidth="0.6"
            >
              <title>{`${m.produto_nome} · ${m.quantity} ${m.unit}`}</title>
            </circle>
            {/* Ponto interno (brilho) */}
            <circle cx={m.x - 0.45} cy={m.y - 0.45} r="0.5" fill="rgba(255,255,255,0.45)" stroke="none" />
            {/* Quantidade */}
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
        ))}
      </svg>
    </div>
  )
}

export { BodyMapSVG }
export default BodyMapSVG

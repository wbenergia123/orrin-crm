import { useState, useId } from 'react'
import type { MouseEvent } from 'react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MarkingData {
  id: string
  x: number // 0-100 (percentage of viewBox width)
  y: number // 0-100 (percentage of viewBox height)
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
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STROKE = '#cbd5e1' // slate-300
const FILL = '#f8fafc' // slate-50
const SW = 1.5
const GRID_COLOR = '#e2e8f0' // slate-200

const VIEW_LABELS: Record<BodyMapSVGProps['viewType'], string> = {
  face_front: 'Vista frontal do rosto',
  face_left: 'Perfil esquerdo do rosto',
  face_right: 'Perfil direito do rosto',
  body_front: 'Vista frontal do corpo',
  body_back: 'Vista posterior do corpo',
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert screen (client) coordinates to SVG viewBox coordinates (0–100).
 * Uses the inverse of the SVG's current transformation matrix so the
 * result is correct regardless of preserveAspectRatio or scaling.
 */
function getSvgCoords(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const inv = ctm.inverse()
  return {
    x: clientX * inv.a + clientY * inv.c + inv.e,
    y: clientX * inv.b + clientY * inv.d + inv.f,
  }
}

/* ------------------------------------------------------------------ */
/*  SVG illustration fragments                                         */
/*  All paths live in the 0 0 100 100 viewBox.                         */
/* ------------------------------------------------------------------ */

/** Frontal face view — oval outline, eyes, nose, mouth, hair, ears. */
function FaceFront() {
  return (
    <>
      {/* Face outline */}
      <ellipse cx="50" cy="52" rx="22" ry="30" />
      {/* Hair / forehead line */}
      <path d="M 30 37 Q 50 23 70 37" fill="none" />
      {/* Eyebrows */}
      <path d="M 34 45 Q 40 43 46 45" fill="none" />
      <path d="M 54 45 Q 60 43 66 45" fill="none" />
      {/* Eyes */}
      <ellipse cx="40" cy="49" rx="5" ry="3" />
      <ellipse cx="60" cy="49" rx="5" ry="3" />
      {/* Pupils */}
      <circle cx="40" cy="49" r="1.5" fill={STROKE} stroke="none" />
      <circle cx="60" cy="49" r="1.5" fill={STROKE} stroke="none" />
      {/* Nose — vertical line with small nostril curve */}
      <path d="M 50 53 L 50 64 M 48 64 Q 50 66 52 64" fill="none" />
      {/* Mouth */}
      <path d="M 42 72 Q 50 76 58 72" fill="none" />
      {/* Ears */}
      <ellipse cx="28" cy="54" rx="3" ry="7" />
      <ellipse cx="72" cy="54" rx="3" ry="7" />
    </>
  )
}

/** Left profile — nose protrudes to the left, back of head on the right. */
function FaceLeft() {
  return (
    <>
      {/* Profile outline */}
      <path
        d={
          'M 62 22 ' + // top of head (right side)
          'C 52 20 46 26 45 34 ' + // forehead curving down-left
          'C 44 38 42 40 40 41 ' + // brow ridge → nose bridge
          'L 28 44 ' + // nose tip (protruding left)
          'C 24 46 25 50 30 52 ' + // under nose curving back
          'L 36 54 ' + // philtrum
          'L 34 57 ' + // upper lip
          'L 33 61 ' + // lower lip
          'C 35 63 36 64 34 65 ' + // chin area
          'L 38 69 ' + // chin bottom
          'C 42 73 50 72 54 68 ' + // jaw line going right
          'L 60 72 ' + // under jaw
          'L 64 80 ' + // neck
          'C 72 76 78 58 78 36 ' + // back of head going up
          'C 78 26 72 22 62 22 ' + // top of head back to start
          'Z'
        }
      />
      {/* Eye */}
      <ellipse cx="52" cy="44" rx="3" ry="2" />
      <circle cx="51" cy="44" r="1" fill={STROKE} stroke="none" />
      {/* Eyebrow */}
      <path d="M 48 40 Q 54 38 58 40" fill="none" />
      {/* Mouth */}
      <path d="M 34 62 Q 38 64 42 62" fill="none" />
      {/* Ear */}
      <ellipse cx="62" cy="50" rx="3" ry="6" />
    </>
  )
}

/** Right profile — mirror of left profile. */
function FaceRight() {
  return (
    <g transform="scale(-1,1) translate(-100,0)">
      <FaceLeft />
    </g>
  )
}

/**
 * Shared body outline used by both body_front and body_back.
 * Head circle, neck, shoulders, torso, arms, hands, legs, feet.
 */
function BodyOutline({ showFace }: { showFace: boolean }) {
  return (
    <>
      {/* Head */}
      <circle cx="50" cy="10" r="7" />
      {showFace && (
        <>
          <circle cx="47" cy="9" r="0.8" fill={STROKE} stroke="none" />
          <circle cx="53" cy="9" r="0.8" fill={STROKE} stroke="none" />
        </>
      )}

      {/* Neck */}
      <path d="M 46 16 L 46 21 M 54 16 L 54 21" fill="none" />

      {/* Torso — shoulders to hips */}
      <path d="M 46 21 C 38 22 32 25 30 29 C 29 35 30 45 33 53 L 36 57 L 64 57 L 67 53 C 70 45 71 35 70 29 C 68 25 62 22 54 21 Z" />

      {/* Left arm */}
      <path d="M 30 29 C 28 32 27 38 27 48 L 28 58 L 32 58 L 33 48 C 33 38 33 32 32 29 Z" />

      {/* Right arm */}
      <path d="M 70 29 C 72 32 73 38 73 48 L 72 58 L 68 58 L 67 48 C 67 38 67 32 68 29 Z" />

      {/* Hands */}
      <circle cx="30" cy="60" r="3" />
      <circle cx="70" cy="60" r="3" />

      {/* Left leg */}
      <path d="M 36 57 L 37 97 L 47 97 L 48 57 Z" />

      {/* Right leg */}
      <path d="M 64 57 L 63 97 L 53 97 L 52 57 Z" />

      {/* Feet */}
      <ellipse cx="42" cy="97" rx="6" ry="2" />
      <ellipse cx="58" cy="97" rx="6" ry="2" />
    </>
  )
}

/** Frontal body — includes chest / abdomen / waist dashed indicators. */
function BodyFront() {
  return (
    <>
      <BodyOutline showFace={true} />
      {/* Chest line */}
      <line x1="33" y1="35" x2="67" y2="35" strokeDasharray="2,1.5" />
      {/* Abdomen line */}
      <line x1="35" y1="47" x2="65" y2="47" strokeDasharray="2,1.5" />
      {/* Waist line */}
      <line x1="36" y1="53" x2="64" y2="53" strokeDasharray="2,1.5" />
    </>
  )
}

/** Posterior body — spine line, scapulae, sacral indicator; no face. */
function BodyBack() {
  return (
    <>
      <BodyOutline showFace={false} />
      {/* Spine */}
      <line x1="50" y1="22" x2="50" y2="56" />
      {/* Left scapula */}
      <path d="M 38 30 Q 44 33 46 38" fill="none" />
      {/* Right scapula */}
      <path d="M 62 30 Q 56 33 54 38" fill="none" />
      {/* Sacral line */}
      <line x1="44" y1="54" x2="56" y2="54" strokeDasharray="2,1.5" />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

function BodyMapSVG({
  viewType,
  markings = [],
  onAddMarking,
  onMarkingClick,
  showQuantities = false,
  className,
}: BodyMapSVGProps) {
  const rawId = useId()
  const gridId = `bm-grid-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  const [isHovering, setIsHovering] = useState(false)

  /* ---- event handlers ---- */

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onAddMarking) return
    const coords = getSvgCoords(e.currentTarget, e.clientX, e.clientY)
    if (coords) onAddMarking(coords.x, coords.y)
  }

  const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!onAddMarking) return
    const coords = getSvgCoords(e.currentTarget, e.clientX, e.clientY)
    setHoverPos(coords)
  }

  const handleMouseEnter = () => setIsHovering(true)

  const handleMouseLeave = () => {
    setIsHovering(false)
    setHoverPos(null)
  }

  /* ---- view switch ---- */

  const renderView = () => {
    switch (viewType) {
      case 'face_front':
        return <FaceFront />
      case 'face_left':
        return <FaceLeft />
      case 'face_right':
        return <FaceRight />
      case 'body_front':
        return <BodyFront />
      case 'body_back':
        return <BodyBack />
    }
  }

  /* ---- render ---- */

  return (
    <div className={className} style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={VIEW_LABELS[viewType]}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          cursor: onAddMarking ? 'crosshair' : 'default',
        }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* ---- definitions ---- */}
        <defs>
          <pattern
            id={gridId}
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 10 0 L 0 0 0 10"
              fill="none"
              stroke={GRID_COLOR}
              strokeWidth="0.25"
            />
          </pattern>
        </defs>

        {/* ---- subtle grid (brighter on hover) ---- */}
        <rect
          width="100"
          height="100"
          fill={`url(#${gridId})`}
          opacity={isHovering && onAddMarking ? 0.8 : 0.3}
          style={{ transition: 'opacity 0.2s', pointerEvents: 'none' }}
        />

        {/* ---- body illustration ---- */}
        <g
          stroke={STROKE}
          strokeWidth={SW}
          fill={FILL}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {renderView()}
        </g>

        {/* ---- crosshair on hover ---- */}
        {hoverPos && onAddMarking && (
          <g
            pointerEvents="none"
            stroke={STROKE}
            strokeWidth="0.3"
            strokeDasharray="1,1"
            opacity={0.6}
          >
            <line x1={hoverPos.x} y1="0" x2={hoverPos.x} y2="100" />
            <line x1="0" y1={hoverPos.y} x2="100" y2={hoverPos.y} />
            <circle
              cx={hoverPos.x}
              cy={hoverPos.y}
              r="0.8"
              fill={STROKE}
              stroke="none"
            />
          </g>
        )}

        {/* ---- existing markings ---- */}
        {markings.map((m) => (
          <g
            key={m.id}
            onClick={(e) => {
              e.stopPropagation()
              onMarkingClick?.(m.id)
            }}
            style={{ cursor: onMarkingClick ? 'pointer' : 'default' }}
          >
            <circle
              cx={m.x}
              cy={m.y}
              r="2.5"
              fill={m.cor_hex}
              stroke="white"
              strokeWidth="0.8"
            >
              <title>{`${m.produto_nome} · ${m.quantity} ${m.unit}`}</title>
            </circle>
            {showQuantities && (
              <text
                x={m.x + 3.5}
                y={m.y + 1}
                fontSize="3"
                fill={m.cor_hex}
                fontWeight="600"
                textAnchor="start"
                dominantBaseline="middle"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {m.quantity} {m.unit}
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

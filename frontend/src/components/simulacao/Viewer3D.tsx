// frontend/src/components/simulacao/Viewer3D.tsx
import { forwardRef, useImperativeHandle, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, Center } from '@react-three/drei'
import * as THREE from 'three'
import { MotorDeformacao, type Vec3, type RegiaoConfig } from '../../lib/simulacao/deformacao'

export interface Viewer3DHandle {
  aplicarSliders: (ancoras: Record<string, Vec3>, valores: Record<string, number>, configs: RegiaoConfig[]) => void
  mostrarAntes: (antes: boolean) => void
  capturarPng: () => Promise<Blob | null>
  limparIndices: () => void
}

interface Props {
  glbUrl: string
  // modo âncora: quando setado, o próximo clique na malha chama o callback com o ponto 3D (espaço LOCAL da malha)
  onCliqueMalha?: (ponto: Vec3) => void
}

function Modelo({ glbUrl, onCliqueMalha, registrar }: Props & {
  registrar: (mesh: THREE.Mesh, motor: MotorDeformacao, original: Float32Array) => void
}) {
  const { scene } = useGLTF(glbUrl)

  const mesh = useMemo<THREE.Mesh | null>(() => {
    let encontrada: THREE.Mesh | null = null
    scene.traverse((obj) => {
      if (!encontrada && (obj as THREE.Mesh).isMesh) encontrada = obj as THREE.Mesh
    })
    return encontrada
  }, [scene])

  useEffect(() => {
    if (!mesh) return
    const posAttr = mesh.geometry.attributes.position
    const original = new Float32Array(posAttr.array as Float32Array) // clone — NUNCA modificado
    mesh.geometry.computeBoundingBox()
    const bb = mesh.geometry.boundingBox!
    const diagonal = bb.getSize(new THREE.Vector3()).length()
    registrar(mesh, new MotorDeformacao(original, diagonal), original)
  }, [mesh, registrar])

  if (!mesh) return null
  return (
    <Center>
      <primitive
        object={scene}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (!onCliqueMalha) return
          e.stopPropagation()
          // e.point é o ponto de interseção em coordenadas de mundo (r3f faz o raycast);
          // converter para o espaço local da malha, que é o espaço das âncoras/posições
          const local = mesh.worldToLocal(e.point.clone())
          onCliqueMalha({ x: local.x, y: local.y, z: local.z })
        }}
      />
    </Center>
  )
}

function Captura({ registrarCaptura }: { registrarCaptura: (fn: () => Promise<Blob | null>) => void }) {
  const { gl } = useThree()
  useEffect(() => {
    registrarCaptura(() => new Promise((resolve) => gl.domElement.toBlob(resolve, 'image/png')))
  }, [gl, registrarCaptura])
  return null
}

export const Viewer3D = forwardRef<Viewer3DHandle, Props>(function Viewer3D(props, ref) {
  const meshRef = useRef<THREE.Mesh | null>(null)
  const motorRef = useRef<MotorDeformacao | null>(null)
  const originalRef = useRef<Float32Array | null>(null)
  const deformadoRef = useRef<Float32Array | null>(null)
  const capturaRef = useRef<(() => Promise<Blob | null>) | null>(null)
  const [pronto, setPronto] = useState(false)

  useImperativeHandle(ref, () => ({
    aplicarSliders(ancoras, valores, configs) {
      const mesh = meshRef.current, motor = motorRef.current, original = originalRef.current
      if (!mesh || !motor || !original) return
      if (!deformadoRef.current) deformadoRef.current = new Float32Array(original.length)
      motor.aplicar(deformadoRef.current, ancoras, valores, configs)
      ;(mesh.geometry.attributes.position.array as Float32Array).set(deformadoRef.current)
      mesh.geometry.attributes.position.needsUpdate = true
      mesh.geometry.computeVertexNormals()
    },
    mostrarAntes(antes) {
      const mesh = meshRef.current, original = originalRef.current
      if (!mesh || !original) return
      const alvo = antes ? original : (deformadoRef.current ?? original)
      ;(mesh.geometry.attributes.position.array as Float32Array).set(alvo)
      mesh.geometry.attributes.position.needsUpdate = true
      mesh.geometry.computeVertexNormals()
    },
    async capturarPng() {
      return capturaRef.current ? capturaRef.current() : null
    },
    limparIndices() {
      motorRef.current?.limparIndices()
    },
  }))

  return (
    <div className="w-full h-[480px] bg-gray-50 rounded-xl overflow-hidden relative">
      <Canvas gl={{ preserveDrawingBuffer: true }} camera={{ position: [0, 0, 2.2], fov: 40 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[1, 2, 3]} intensity={1.2} />
        <Suspense fallback={null}>
          <Modelo
            {...props}
            registrar={(mesh, motor, original) => {
              meshRef.current = mesh
              motorRef.current = motor
              originalRef.current = original
              setPronto(true)
            }}
          />
        </Suspense>
        <OrbitControls enablePan={false} minDistance={1} maxDistance={5} />
        <Captura registrarCaptura={(fn) => { capturaRef.current = fn }} />
      </Canvas>
      {!pronto && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          Carregando modelo 3D…
        </div>
      )}
    </div>
  )
})

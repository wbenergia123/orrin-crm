// backend/src/lib/meshy.ts
// Wrapper fino da API Meshy (Multi-Image to 3D). Sem regra de negócio.
import axios from 'axios'

const BASE = 'https://api.meshy.ai/openapi/v1/multi-image-to-3d'

function headers() {
  if (!process.env.MESHY_API_KEY) throw new Error('MESHY_API_KEY não configurada')
  return { Authorization: `Bearer ${process.env.MESHY_API_KEY}` }
}

export interface MeshyTaskStatus {
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED'
  progress?: number
  model_urls?: { glb?: string }
  thumbnail_url?: string
}

export async function criarTask(imageUrls: string[]): Promise<string> {
  const { data } = await axios.post(
    BASE,
    { image_urls: imageUrls, should_texture: true, target_formats: ['glb'] },
    { headers: headers() }
  )
  return data.result
}

export async function consultarTask(taskId: string): Promise<MeshyTaskStatus> {
  const { data } = await axios.get(`${BASE}/${taskId}`, { headers: headers() })
  return data
}

export async function baixarArquivo(url: string): Promise<Buffer> {
  const { data } = await axios.get(url, { responseType: 'arraybuffer', maxContentLength: 30 * 1024 * 1024 })
  return Buffer.from(data)
}

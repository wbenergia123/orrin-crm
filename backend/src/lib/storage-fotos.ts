import { supabaseAdmin } from '../services/supabase'

// Bucket privado das fotos de paciente (também mídia de WhatsApp e imagens de referência).
// Os registros passam a guardar o CAMINHO no bucket; URLs públicas antigas ainda são aceitas.
const BUCKET = 'fotos-pacientes'
const TTL_SEGUNDOS = 60 * 60 // links assinados válidos por 1h

/** Extrai o caminho dentro do bucket, aceitando tanto um caminho puro quanto uma URL pública antiga. */
export function caminhoNoBucket(valor: string | null): string | null {
  if (!valor) return null
  const marca = `/object/public/${BUCKET}/`
  const i = valor.indexOf(marca)
  if (i >= 0) return decodeURIComponent(valor.slice(i + marca.length))
  const marcaSign = `/object/sign/${BUCKET}/`
  const j = valor.indexOf(marcaSign)
  if (j >= 0) return decodeURIComponent(valor.slice(j + marcaSign.length).split('?')[0])
  return valor // já é um caminho
}

/** Link assinado de curta duração para exibir a foto; null se não houver. */
export async function assinarFoto(valor: string | null): Promise<string | null> {
  const path = caminhoNoBucket(valor)
  if (!path) return null
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, TTL_SEGUNDOS)
  return data?.signedUrl ?? null
}

/** Remove o arquivo do bucket (usar ao excluir o registro). Silencioso se o caminho for inválido. */
export async function removerFoto(valor: string | null): Promise<void> {
  const path = caminhoNoBucket(valor)
  if (!path) return
  await supabaseAdmin.storage.from(BUCKET).remove([path])
}

// frontend/src/pages/OrgNaoEncontrada.tsx
interface Props {
  slug: string
}

export default function OrgNaoEncontrada({ slug }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Organização não encontrada</h2>
        <p className="text-gray-500">
          Nenhuma organização ativa encontrada para{' '}
          <code className="bg-gray-100 px-2 py-1 rounded">{slug}</code>.
        </p>
        <p className="text-gray-400 text-sm mt-4">
          Verifique o link com a equipe Orrin.
        </p>
      </div>
    </div>
  )
}

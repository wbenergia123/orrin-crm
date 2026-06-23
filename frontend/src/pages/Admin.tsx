import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Plus, CheckCircle2, XCircle, Trash2 } from 'lucide-react'

interface Tenant {
  id: string
  slug: string
  nome: string
  ativo: boolean
  created_at: string
}

export function Admin() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  const [slug, setSlug] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [criado, setCriado] = useState<{ url: string; email: string; senha: string } | null>(null)

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['admin-tenants'],
    queryFn: async () => (await api.get('/admin/tenants')).data,
  })

  const { mutate: criar, isPending } = useMutation({
    mutationFn: async () =>
      (await api.post('/admin/tenants', {
        slug,
        nome,
        admin_email: email,
        admin_senha: senha || undefined,
      })).data,
    onSuccess: (data) => {
      setCriado({ url: data.url, email: data.admin_email, senha: data.admin_senha })
      setSlug('')
      setNome('')
      setEmail('')
      setSenha('')
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
  })

  const { mutate: toggle } = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      api.patch(`/admin/tenants/${id}`, { ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  const { mutate: cancelar, isPending: cancelando } = useMutation({
    mutationFn: (id: string) => api.post(`/admin/tenants/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  if (usuario?.role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Acesso restrito a super administradores.
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
        <Building2 size={22} />
        Admin — Clínicas
      </h1>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-gray-800">Nova clínica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="slug">Slug (subdomínio)</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="ex: clinica-beleza"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nome">Nome da clínica</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Clínica Beleza"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">E-mail do admin</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@clinica.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="senha">Senha (opcional)</Label>
              <Input
                id="senha"
                type="text"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="padrão: senha123"
              />
            </div>
          </div>

          <Button onClick={() => criar()} disabled={isPending || !slug || !nome || !email}>
            <Plus size={16} className="mr-1" />
            {isPending ? 'Criando...' : 'Criar clínica'}
          </Button>

          {criado && (
            <div className="bg-emerald-50 text-emerald-800 text-sm p-3 rounded-lg border border-emerald-100">
              <p className="font-semibold">Clínica criada!</p>
              <p>URL: <a href={criado.url} className="underline" target="_blank" rel="noreferrer">{criado.url}</a></p>
              <p>Login: <strong>{criado.email}</strong></p>
              <p>Senha: <strong>{criado.senha}</strong></p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-gray-800">Clínicas cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : tenants.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma clínica cadastrada.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {tenants.map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-800">{t.nome}</p>
                    <p className="text-xs text-gray-400">
                      {t.slug}.orrin.com.br · {new Date(t.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggle({ id: t.id, ativo: !t.ativo })}
                      className="flex items-center gap-1 text-xs font-medium"
                    >
                      {t.ativo ? (
                        <>
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          <span className="text-emerald-600">Ativa</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={14} className="text-red-400" />
                          <span className="text-red-500">Inativa</span>
                        </>
                      )}
                    </button>
                    {t.ativo && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Cancelar a clínica "${t.nome}"? Isso bloqueia o login de todos os usuários dela.`)) {
                            cancelar(t.id)
                          }
                        }}
                        disabled={cancelando}
                        className="text-red-400 hover:text-red-600 disabled:opacity-50"
                        title="Cancelar clínica"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

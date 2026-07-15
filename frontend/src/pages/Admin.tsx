import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { parseUtcTimestamp } from '../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Plus, Trash2, ShieldOff } from 'lucide-react'

interface Tenant {
  id: string
  slug: string
  nome: string
  ativo: boolean
  created_at: string
  studio_3d_ativo: boolean
  vertical: string
}

export function Admin() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  const [slug, setSlug] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [vertical, setVertical] = useState<'clinica' | 'agro'>('clinica')
  const [criado, setCriado] = useState<{ url: string; email: string; senha: string } | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [confirmTexto, setConfirmTexto] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [uazapiUrl, setUazapiUrl] = useState('')
  const [uazapiToken, setUazapiToken] = useState('')
  const [uazapiUrlCriacao, setUazapiUrlCriacao] = useState('')
  const [uazapiTokenCriacao, setUazapiTokenCriacao] = useState('')
  const [carregandoUazapiId, setCarregandoUazapiId] = useState<string | null>(null)
  const [editandoPromptId, setEditandoPromptId] = useState<string | null>(null)
  const [promptAna, setPromptAna] = useState('')
  const [anaModel, setAnaModel] = useState('')
  const [carregandoPromptId, setCarregandoPromptId] = useState<string | null>(null)

  const [usuariosAbertoId, setUsuariosAbertoId] = useState<string | null>(null)
  const [carregandoUsuariosId, setCarregandoUsuariosId] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<{ id: string; email: string; role: string; ativo: boolean }[]>([])
  const [resetandoId, setResetandoId] = useState<string | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [senhaResetada, setSenhaResetada] = useState<{ email: string; senha: string } | null>(null)

  const [emailBloqueio, setEmailBloqueio] = useState('')
  const [statusBloqueio, setStatusBloqueio] = useState<{ tentativas: number; bloqueadoAte: string | null } | null>(null)
  const [carregandoBloqueio, setCarregandoBloqueio] = useState(false)

  const verificarBloqueio = async () => {
    if (!emailBloqueio.trim()) return
    setCarregandoBloqueio(true)
    try {
      const { data } = await api.get(`/admin/login-status/${encodeURIComponent(emailBloqueio.trim())}`)
      setStatusBloqueio(data)
    } catch {
      alert('Erro ao verificar status.')
    } finally {
      setCarregandoBloqueio(false)
    }
  }

  const { mutate: desbloquear, isPending: desbloqueando } = useMutation({
    mutationFn: () => api.delete(`/admin/login-status/${encodeURIComponent(emailBloqueio.trim())}`),
    onSuccess: () => {
      setStatusBloqueio({ tentativas: 0, bloqueadoAte: null })
    },
    onError: () => alert('Erro ao desbloquear.'),
  })

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
        uazapi_url: uazapiUrlCriacao || undefined,
        uazapi_token: uazapiTokenCriacao || undefined,
        vertical,
      })).data,
    onSuccess: (data) => {
      setCriado({ url: data.url, email: data.admin_email, senha: data.admin_senha })
      setSlug('')
      setNome('')
      setEmail('')
      setSenha('')
      setVertical('clinica')
      setUazapiUrlCriacao('')
      setUazapiTokenCriacao('')
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
  })

  const { mutate: toggle } = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      api.patch(`/admin/tenants/${id}`, { ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  const { mutate: toggleStudio3d } = useMutation({
    mutationFn: ({ id, studio_3d_ativo }: { id: string; studio_3d_ativo: boolean }) =>
      api.patch(`/admin/tenants/${id}`, { studio_3d_ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  const { mutate: cancelar, isPending: cancelando } = useMutation({
    mutationFn: (id: string) => api.post(`/admin/tenants/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setConfirmandoId(null)
      setConfirmTexto('')
    },
  })

  const { mutate: salvarUazapi, isPending: salvandoUazapi } = useMutation({
    mutationFn: async ({ id, uazapi_url, uazapi_token }: { id: string; uazapi_url: string; uazapi_token: string }) =>
      (await api.patch(`/admin/tenants/${id}/uazapi`, { uazapi_url, uazapi_token })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setEditandoId(null)
      setUazapiUrl('')
      setUazapiToken('')
    },
  })

  const { mutate: salvarPrompt, isPending: salvandoPrompt } = useMutation({
    mutationFn: async ({ id, prompt_ana, ana_model }: { id: string; prompt_ana: string; ana_model: string }) =>
      (await api.patch(`/admin/tenants/${id}/prompt`, { prompt_ana, ana_model })).data,
    onSuccess: () => {
      setEditandoPromptId(null)
      setPromptAna('')
      setAnaModel('')
    },
  })

  const { mutate: resetarSenha, isPending: resetandoSenha } = useMutation({
    mutationFn: async ({ tenantId, usuarioId, senha: novaSenhaEnviada }: { tenantId: string; usuarioId: string; senha: string }) =>
      (await api.post(`/admin/tenants/${tenantId}/usuarios/${usuarioId}/resetar-senha`, novaSenhaEnviada ? { senha: novaSenhaEnviada } : {})).data,
    onSuccess: (data) => {
      setSenhaResetada({ email: data.email, senha: data.senha })
      setResetandoId(null)
      setNovaSenha('')
    },
    onError: () => alert('Não foi possível resetar a senha. Tente novamente.'),
  })

  const { mutate: impersonar, isPending: impersonando } = useMutation({
    mutationFn: (id: string) => api.post(`/admin/tenants/${id}/impersonate`).then((r) => r.data),
    onSuccess: (data) => {
      const params = new URLSearchParams({
        token: data.token,
        org_id: data.org.id,
        org_slug: data.org.slug,
        org_nome: data.org.nome,
      })
      window.location.href = `https://${data.org.slug}.orrin.com.br/impersonar?${params}`
    },
    onError: () => alert('Não foi possível entrar como essa clínica. Tente novamente.'),
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
            <div className="space-y-1">
              <Label htmlFor="vertical">Vertical</Label>
              <select
                id="vertical"
                value={vertical}
                onChange={(e) => setVertical(e.target.value as 'clinica' | 'agro')}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
              >
                <option value="clinica">Clínica</option>
                <option value="agro">Agro</option>
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="uazapi-url">URL da instância UAZAPI (opcional)</Label>
              <Input
                id="uazapi-url"
                value={uazapiUrlCriacao}
                onChange={(e) => setUazapiUrlCriacao(e.target.value)}
                placeholder="https://sua-instancia.uazapi.com"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="uazapi-token">Token da instância UAZAPI (opcional)</Label>
              <Input
                id="uazapi-token"
                type="text"
                value={uazapiTokenCriacao}
                onChange={(e) => setUazapiTokenCriacao(e.target.value)}
                placeholder="token-da-instancia"
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
                <div key={t.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-800 flex items-center gap-2">
                      {t.nome}
                      {t.vertical === 'agro' && (
                        <span className="text-[10px] font-semibold uppercase bg-green-100 text-green-700 rounded px-1.5 py-0.5">Agro</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {t.slug}.orrin.com.br · {parseUtcTimestamp(t.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmandoId === t.id ? (
                      <>
                        <Input
                          autoFocus
                          value={confirmTexto}
                          onChange={(e) => setConfirmTexto(e.target.value)}
                          placeholder='digite "excluir"'
                          className="h-7 w-32 text-xs"
                        />
                        <button
                          onClick={() => cancelar(t.id)}
                          disabled={confirmTexto.trim().toLowerCase() !== 'excluir' || cancelando}
                          className="text-xs font-medium text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                        >
                          {cancelando ? 'Excluindo...' : 'Confirmar'}
                        </button>
                        <button
                          onClick={() => { setConfirmandoId(null); setConfirmTexto('') }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => toggle({ id: t.id, ativo: !t.ativo })}
                          className={
                            t.ativo
                              ? 'text-xs font-medium px-2.5 py-1 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              : 'text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50'
                          }
                        >
                          {t.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          onClick={() => toggleStudio3d({ id: t.id, studio_3d_ativo: !t.studio_3d_ativo })}
                          className={
                            t.studio_3d_ativo
                              ? 'text-xs font-medium px-2.5 py-1 rounded-md border border-violet-200 text-violet-700 hover:bg-violet-50'
                              : 'text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50'
                          }
                        >
                          {t.studio_3d_ativo ? 'Studio 3D: ON' : 'Studio 3D: OFF'}
                        </button>
                        {t.ativo && (
                          <>
                            <button
                              onClick={() => impersonar(t.id)}
                              disabled={impersonando}
                              className="text-xs font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
                            >
                              {impersonando ? 'Entrando...' : 'Entrar como'}
                            </button>
                            <button
                              onClick={async () => {
                                setCarregandoUazapiId(t.id)
                                try {
                                  const { data } = await api.get<{ uazapi_url: string; uazapi_token: string }>(`/admin/tenants/${t.id}/uazapi`)
                                  setUazapiUrl(data.uazapi_url)
                                  setUazapiToken(data.uazapi_token)
                                  setEditandoId(t.id)
                                } catch {
                                  alert('Não foi possível carregar a configuração do WhatsApp.')
                                } finally {
                                  setCarregandoUazapiId(null)
                                }
                              }}
                              disabled={carregandoUazapiId === t.id}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                            >
                              {carregandoUazapiId === t.id ? 'Carregando...' : 'Editar WhatsApp'}
                            </button>
                            <button
                              onClick={async () => {
                                setCarregandoPromptId(t.id)
                                try {
                                  const { data } = await api.get<{ prompt_ana: string; ana_model: string }>(`/admin/tenants/${t.id}/prompt`)
                                  setPromptAna(data.prompt_ana)
                                  setAnaModel(data.ana_model)
                                  setEditandoPromptId(t.id)
                                } catch {
                                  alert('Não foi possível carregar o prompt da Ana.')
                                } finally {
                                  setCarregandoPromptId(null)
                                }
                              }}
                              disabled={carregandoPromptId === t.id}
                              className="text-xs font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
                            >
                              {carregandoPromptId === t.id ? 'Carregando...' : 'Editar Prompt'}
                            </button>
                            <button
                              onClick={async () => {
                                if (usuariosAbertoId === t.id) { setUsuariosAbertoId(null); return }
                                setCarregandoUsuariosId(t.id)
                                try {
                                  const { data } = await api.get(`/admin/tenants/${t.id}/usuarios`)
                                  setUsuarios(data)
                                  setUsuariosAbertoId(t.id)
                                  setSenhaResetada(null)
                                } catch {
                                  alert('Não foi possível carregar os logins.')
                                } finally {
                                  setCarregandoUsuariosId(null)
                                }
                              }}
                              disabled={carregandoUsuariosId === t.id}
                              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                            >
                              {carregandoUsuariosId === t.id ? 'Carregando...' : usuariosAbertoId === t.id ? 'Ocultar logins' : 'Ver logins'}
                            </button>
                            <button
                              onClick={() => { setConfirmandoId(t.id); setConfirmTexto('') }}
                              className="text-red-400 hover:text-red-600"
                              title="Cancelar clínica"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {editandoId === t.id && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        value={uazapiUrl}
                        onChange={(e) => setUazapiUrl(e.target.value)}
                        placeholder="URL da instância UAZAPI"
                        className="text-xs"
                      />
                      <Input
                        value={uazapiToken}
                        onChange={(e) => setUazapiToken(e.target.value)}
                        placeholder="Token da instância UAZAPI"
                        className="text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={salvandoUazapi}
                        onClick={() => salvarUazapi({ id: t.id, uazapi_url: uazapiUrl, uazapi_token: uazapiToken })}
                      >
                        {salvandoUazapi ? 'Salvando...' : 'Salvar'}
                      </Button>
                      <button
                        onClick={() => { setEditandoId(null); setUazapiUrl(''); setUazapiToken('') }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                {editandoPromptId === t.id && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    <textarea
                      value={promptAna}
                      onChange={(e) => setPromptAna(e.target.value)}
                      placeholder="Personalidade da Ana pra essa clínica..."
                      rows={14}
                      className="w-full border border-gray-200 rounded-lg p-3 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <div className="space-y-1">
                      <Label htmlFor={`modelo-${t.id}`} className="text-xs">Modelo da Ana</Label>
                      <select
                        id={`modelo-${t.id}`}
                        value={anaModel}
                        onChange={(e) => setAnaModel(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="">Padrão do sistema (Haiku — mais barato)</option>
                        <option value="claude-haiku-4-5-20251001">Haiku 4.5 (mais barato)</option>
                        <option value="claude-sonnet-4-6">Sonnet 4.6 (mais inteligente)</option>
                        <option value="claude-opus-4-8">Opus 4.8 (mais caro e mais capaz)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={salvandoPrompt}
                        onClick={() => salvarPrompt({ id: t.id, prompt_ana: promptAna, ana_model: anaModel })}
                      >
                        {salvandoPrompt ? 'Salvando...' : 'Salvar'}
                      </Button>
                      <button
                        onClick={() => { setEditandoPromptId(null); setPromptAna(''); setAnaModel('') }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                {usuariosAbertoId === t.id && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    {usuarios.length === 0 && (
                      <p className="text-xs text-gray-400">Nenhum usuário cadastrado nessa clínica.</p>
                    )}
                    {usuarios.map((u) => (
                      <div key={u.id} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs">
                            <span className="font-medium text-gray-700">{u.email}</span>
                            <span className="text-gray-400"> · {u.role}{!u.ativo && ' · desativado'}</span>
                          </div>
                          {resetandoId === u.id ? null : (
                            <button
                              onClick={() => { setResetandoId(u.id); setNovaSenha(''); setSenhaResetada(null) }}
                              className="text-xs font-medium text-amber-600 hover:text-amber-700"
                            >
                              Resetar senha
                            </button>
                          )}
                        </div>
                        {resetandoId === u.id && (
                          <div className="flex items-center gap-2 pl-2">
                            <Input
                              value={novaSenha}
                              onChange={(e) => setNovaSenha(e.target.value)}
                              placeholder="Nova senha (em branco = senha123)"
                              className="text-xs"
                            />
                            <Button
                              size="sm"
                              disabled={resetandoSenha}
                              onClick={() => resetarSenha({ tenantId: t.id, usuarioId: u.id, senha: novaSenha })}
                            >
                              {resetandoSenha ? 'Salvando...' : 'Confirmar'}
                            </Button>
                            <button
                              onClick={() => setResetandoId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {senhaResetada && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-800">
                        Senha de <strong>{senhaResetada.email}</strong> redefinida para: <strong>{senhaResetada.senha}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <ShieldOff size={16} />
            Desbloquear login
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-400">Após 5 tentativas erradas o usuário é bloqueado por 15 minutos. Use aqui para desbloquear manualmente.</p>
          <div className="flex gap-2">
            <Input
              placeholder="email@clinica.com"
              value={emailBloqueio}
              onChange={(e) => { setEmailBloqueio(e.target.value); setStatusBloqueio(null) }}
              className="flex-1"
            />
            <Button variant="outline" onClick={verificarBloqueio} disabled={carregandoBloqueio || !emailBloqueio.trim()}>
              {carregandoBloqueio ? 'Verificando...' : 'Verificar'}
            </Button>
          </div>

          {statusBloqueio && (
            <div className={`rounded-lg p-3 text-sm border ${statusBloqueio.bloqueadoAte ? 'bg-red-50 border-red-100 text-red-800' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
              {statusBloqueio.bloqueadoAte ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Usuário bloqueado</p>
                    <p className="text-xs mt-0.5">{statusBloqueio.tentativas} tentativas · liberação automática às {new Date(statusBloqueio.bloqueadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <Button size="sm" onClick={() => desbloquear()} disabled={desbloqueando} className="bg-red-600 hover:bg-red-700 text-white shrink-0">
                    {desbloqueando ? 'Desbloqueando...' : 'Desbloquear agora'}
                  </Button>
                </div>
              ) : (
                <p>Usuário não está bloqueado{statusBloqueio.tentativas > 0 ? ` (${statusBloqueio.tentativas} tentativa${statusBloqueio.tentativas > 1 ? 's' : ''} errada${statusBloqueio.tentativas > 1 ? 's' : ''})` : ''}.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

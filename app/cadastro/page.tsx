'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function validarSenha(senha: string): string | null {
  if (senha.length < 8) return 'A senha deve ter no mínimo 8 caracteres.'
  if (!/[A-Z]/.test(senha)) return 'A senha deve conter pelo menos uma letra maiúscula.'
  if (!/[a-z]/.test(senha)) return 'A senha deve conter pelo menos uma letra minúscula.'
  if (!/[0-9]/.test(senha)) return 'A senha deve conter pelo menos um número.'
  return null
}

export default function CadastroPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/')
    })
  }, [router])

  const handleCadastro = async () => {
    setErro('')
    setSucesso('')
    if (!nome || !email || !senha) {
      setErro('Preencha todos os campos.')
      return
    }
    const erroSenha = validarSenha(senha)
    if (erroSenha) {
      setErro(erroSenha)
      return
    }
    setLoading(true)

    const userData: Record<string, string> = { nome }
    if (periodo) userData.periodo = periodo

    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: userData }
    })

    if (error) {
      setErro('Erro ao criar conta. Tente novamente.')
      setLoading(false)
    } else {
      setSucesso('Conta criada! Verifique seu e-mail para confirmar.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-orb-1"></div>
      <div className="auth-orb-2"></div>
      <div className="auth-card">
        <a href="/" className="auth-logo">
          <span className="auth-logo-icon">✦</span>
          <span className="auth-logo-text">MedFlow.AI</span>
        </a>
        <h1 className="auth-title">Criar conta grátis</h1>
        <p className="auth-sub">Junte-se a milhares de estudantes de medicina</p>
        <div className="auth-form">
          <div className="input-group">
            <label className="input-label" htmlFor="nome">Nome completo</label>
            <input
              type="text"
              id="nome"
              className="input-field"
              placeholder="Seu nome"
              value={nome}
              onChange={e => setNome(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="email">E-mail</label>
            <input
              type="email"
              id="email"
              className="input-field"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="senha">Senha</label>
            <input
              type="password"
              id="senha"
              className="input-field"
              placeholder="Min. 8 chars, A-z, 0-9"
              value={senha}
              onChange={e => setSenha(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="periodo">
              Período<span className="label-optional">(opcional)</span>
            </label>
            <select
              id="periodo"
              className="input-field"
              value={periodo}
              onChange={e => setPeriodo(e.target.value)}
            >
              <option value="">Selecionar depois</option>
              <option value="1">1º Período</option>
              <option value="2">2º Período</option>
              <option value="3">3º Período</option>
              <option value="4">4º Período</option>
              <option value="5">5º Período</option>
              <option value="6">6º Período</option>
              <option value="7">7º Período</option>
              <option value="8">8º Período</option>
              <option value="internato">Internato</option>
            </select>
            <span className="periodo-hint">O site recomendará provas e conteúdos do seu período</span>
          </div>
          <button
            className="btn-auth"
            onClick={handleCadastro}
            disabled={loading}
          >
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
          {erro && <p className="auth-error">{erro}</p>}
          {sucesso && (
            <p className="auth-error" style={{ color: '#4ade80' }}>{sucesso}</p>
          )}
          <div className="auth-divider">ou</div>
          <p className="auth-switch">
            Já tem conta? <a href="/login" className="auth-link">Entrar</a>
          </p>
        </div>
      </div>
    </div>
  )
}

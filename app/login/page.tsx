'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/')
    })
  }, [router])

  const handleLogin = async () => {
    setErro('')
    if (!email || !senha) {
      setErro('Preencha todos os campos.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) {
      setErro('E-mail ou senha incorretos.')
      setLoading(false)
    } else {
      router.replace('/')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
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
        <h1 className="auth-title">Bem-vindo de volta</h1>
        <p className="auth-sub">Entre na sua conta para continuar estudando</p>
        <div className="auth-form">
          <div className="input-group">
            <label className="input-label" htmlFor="email">E-mail</label>
            <input
              type="email"
              id="email"
              className="input-field"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="senha">Senha</label>
            <input
              type="password"
              id="senha"
              className="input-field"
              placeholder="••••••••"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            className="btn-auth"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <p className="auth-error">{erro}</p>
          <div className="auth-divider">ou</div>
          <p className="auth-switch">
            Não tem conta?{' '}
            <a href="/cadastro" className="auth-link">Criar conta grátis</a>
          </p>
        </div>
      </div>
    </div>
  )
}

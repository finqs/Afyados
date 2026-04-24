import { supabase } from './supabase.js'

const authError = document.getElementById('auth-error')

function validarSenha(senha) {
  if (senha.length < 8) return 'A senha deve ter no minimo 8 caracteres.'
  if (!/[A-Z]/.test(senha)) return 'A senha deve conter pelo menos uma letra maiuscula.'
  if (!/[a-z]/.test(senha)) return 'A senha deve conter pelo menos uma letra minuscula.'
  if (!/[0-9]/.test(senha)) return 'A senha deve conter pelo menos um numero.'
  return null
}

// LOGIN
const btnLogin = document.getElementById('btn-login')
if (btnLogin) {
  btnLogin.addEventListener('click', async () => {
    const email = document.getElementById('email').value
    const senha = document.getElementById('senha').value

    if (!email || !senha) {
      authError.textContent = 'Preencha todos os campos.'
      return
    }

    btnLogin.textContent = 'Entrando...'
    btnLogin.disabled = true

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      authError.textContent = 'E-mail ou senha incorretos.'
      btnLogin.textContent = 'Entrar'
      btnLogin.disabled = false
    } else {
      btnLogin.textContent = 'Redirecionando...'
      window.location.href = 'index.html'
    }
  })
}

// CADASTRO
const btnCadastro = document.getElementById('btn-cadastro')
if (btnCadastro) {
  btnCadastro.addEventListener('click', async () => {
    const nome = document.getElementById('nome').value
    const email = document.getElementById('email').value
    const senha = document.getElementById('senha').value
    const periodo = document.getElementById('periodo')?.value || null

    if (!nome || !email || !senha) {
      authError.textContent = 'Preencha todos os campos.'
      return
    }

    const erroSenha = validarSenha(senha)
    if (erroSenha) {
      authError.textContent = erroSenha
      return
    }

    btnCadastro.textContent = 'Criando conta...'
    btnCadastro.disabled = true

    const userData = { nome }
    if (periodo) userData.periodo = periodo

    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: userData }
    })

    if (error) {
      authError.textContent = 'Erro ao criar conta. Tente novamente.'
      btnCadastro.textContent = 'Criar conta'
      btnCadastro.disabled = false
    } else {
      authError.style.color = '#4ade80'
      authError.textContent = 'Conta criada! Verifique seu e-mail para confirmar.'
      btnCadastro.textContent = 'Criar conta'
      btnCadastro.disabled = false
    }
  })
}
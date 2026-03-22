import { supabase } from './supabase.js'

const authError = document.getElementById('auth-error')

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

    if (!nome || !email || !senha) {
      authError.textContent = 'Preencha todos os campos.'
      return
    }

    if (senha.length < 6) {
      authError.textContent = 'A senha deve ter no mínimo 6 caracteres.'
      return
    }

    btnCadastro.textContent = 'Criando conta...'
    btnCadastro.disabled = true

    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } }
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
const modal = document.getElementById('modal');
const modalSubject = document.getElementById('modal-subject');
const modalClose = document.getElementById('modal-close');

document.querySelectorAll('.subject-card').forEach(card => {
  card.addEventListener('click', () => {
    const name = card.querySelector('.subject-name').textContent;
    modalSubject.textContent = name;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
});

modalClose.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  modal.classList.remove('active');
  document.body.style.overflow = '';
}
const modalSobre = document.getElementById('modal-sobre');
const modalSobreClose = document.getElementById('modal-sobre-close');
const btnSobre = document.querySelector('.nav-btn');

btnSobre.addEventListener('click', () => {
  modalSobre.classList.add('active');
  document.body.style.overflow = 'hidden';
});

modalSobreClose.addEventListener('click', () => {
  modalSobre.classList.remove('active');
  document.body.style.overflow = '';
});

modalSobre.addEventListener('click', (e) => {
  if (e.target === modalSobre) {
    modalSobre.classList.remove('active');
    document.body.style.overflow = '';
  }
});
import { supabase } from './supabase.js'

// Verifica sessão e atualiza navbar
const btnApoie = document.querySelector('.nav-apoie')

async function verificarSessao() {
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    btnApoie.textContent = 'Sair'
    btnApoie.addEventListener('click', async () => {
      await supabase.auth.signOut()
      window.location.reload()
    })
  } else {
    btnApoie.textContent = 'Login'
    btnApoie.addEventListener('click', () => {
      window.location.href = 'login.html'
    })
  }
}

verificarSessao()
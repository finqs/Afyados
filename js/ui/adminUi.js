import { escapeHtml } from '../utils/utils.js'

export function setStatus(element, msg, tipo) {
  element.textContent = msg
  element.style.color =
    tipo === 'erro'
      ? '#f87171'
      : tipo === 'sucesso'
      ? '#4ade80'
      : 'var(--accent)'
}

export function renderQuestoesAdmin(container, questoes, materia, ano, semestre, onSalvarClick) {
  container.innerHTML = ''

  const wrapper = document.createElement('div')
  wrapper.className = 'admin-card'

  wrapper.innerHTML = `
    <h3>${questoes.length} QUESTÕES · ${escapeHtml(materia)} · ${escapeHtml(ano)}.${escapeHtml(semestre)}</h3>
    ${questoes
      .map(
        q => `
        <div class="questao-admin-item" style="margin-bottom: 1.5rem; padding: 1rem; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;">
          <h4>QUESTÃO ${q.numero}</h4>
          <p>${escapeHtml(q.enunciado)}</p>
          <p><strong>A)</strong> ${escapeHtml(q.alternativa_a)}</p>
          <p><strong>B)</strong> ${escapeHtml(q.alternativa_b)}</p>
          <p><strong>C)</strong> ${escapeHtml(q.alternativa_c)}</p>
          <p><strong>D)</strong> ${escapeHtml(q.alternativa_d)}</p>
          ${
            q.alternativa_e
              ? `<p><strong>E)</strong> ${escapeHtml(q.alternativa_e)}</p>`
              : ''
          }
          <p><strong>✓ Gabarito:</strong> ${escapeHtml(q.gabarito)}</p>
          ${
            q.comentario
              ? `<div style="margin-top: .75rem;"><strong>Comentário:</strong><br>${escapeHtml(q.comentario)}</div>`
              : ''
          }
        </div>
      `
      )
      .join('')}
    <button id="btn-salvar">Salvar prova no banco de dados</button>
  `

  container.appendChild(wrapper)

  const btnSalvar = document.getElementById('btn-salvar')
  btnSalvar.addEventListener('click', onSalvarClick)
}

// Anti-flash: aplica tema antes do render
if (localStorage.getItem('tema') === 'light') {
  document.documentElement.classList.add('light')
}

// Ativa o toggle assim que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  const togWrap = document.getElementById('tog-wrap')
  if (togWrap) {
    togWrap.addEventListener('click', () => {
      const isLight = document.documentElement.classList.toggle('light')
      localStorage.setItem('tema', isLight ? 'light' : 'dark')
    })
  }
})

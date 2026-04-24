'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '24px',
      background: '#060910',
      color: '#e2e8f0',
      fontFamily: 'DM Sans, sans-serif',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.4rem', color: '#fff', margin: 0 }}>
        Algo deu errado
      </h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '400px', margin: 0 }}>
        {error.message?.includes('Supabase env vars')
          ? 'Variáveis de ambiente do Supabase não configuradas. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no Vercel.'
          : error.message || 'Erro inesperado. Tente novamente.'}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '10px 24px',
          background: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
          border: 'none',
          borderRadius: '100px',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: '0.9rem',
        }}
      >
        Tentar novamente
      </button>
    </div>
  )
}

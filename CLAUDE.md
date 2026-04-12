# MedFlow.AI — Contexto do Projeto

## O que é
Plataforma gratuita de estudo para estudantes de medicina (foco na grade curricular da Afya/PBL). Permite acessar provas antigas, fazer simulados interativos e acompanhar o desempenho.

## Stack
- **Frontend**: HTML, CSS, JavaScript puro (ES Modules)
- **Backend**: Vercel Serverless Functions (`/api/*.js` com CommonJS)
- **Banco de dados**: Supabase (PostgreSQL)
- **Autenticação**: Supabase Auth
- **IA**: Anthropic Claude API (via serverless, nunca direto do frontend)
- **Deploy**: Vercel — https://medflowai-gamma.vercel.app
- **Repositório**: https://github.com/finqs/Afyados

## Estrutura de arquivos
```
projeto-afyados/
├── api/
│   └── extrair.js          # Serverless function — extrai questões de PDFs via Claude API
├── css/
│   ├── medbase.css         # CSS principal (design premium dark mode)
│   └── style.css           # CSS legado (ainda usado por algumas páginas)
├── js/
│   ├── api/
│   │   ├── adminApi.js     # Salva provas e questões no Supabase
│   │   └── geminiApi.js    # Chama /api/extrair (nome legado, agora usa Claude)
│   ├── ui/
│   │   └── adminUi.js      # Renderiza questões no painel admin
│   ├── utils/
│   │   ├── parsers.js      # Normaliza JSON de questões extraídas pela IA
│   │   └── utils.js        # escapeHtml, cleanText, fileToBase64
│   ├── admin.js            # Lógica do painel admin
│   ├── auth.js             # Login e cadastro
│   ├── main.js             # Página inicial — períodos, matérias, modais
│   ├── perfil.js           # Perfil do aluno — estatísticas e histórico
│   ├── prova.js            # Engine da prova — timer, questões, gabarito
│   ├── supabase.js         # Cliente Supabase
│   └── tema.js             # Toggle dark/light mode
├── index.html              # Página inicial
├── login.html              # Login
├── cadastro.html           # Cadastro
├── perfil.html             # Perfil do aluno
├── prova.html              # Tela da prova
├── admin.html              # Painel admin (protegido por e-mail)
├── vercel.json             # Config serverless functions
└── package.json            # Dependências (@anthropic-ai/sdk)
```

## Banco de dados (Supabase)

### Tabelas principais
- **provas** — `id, materia, periodo, ano, semestre, criado_em`
- **questoes** — `id, prova_id, tipo (multipla_escolha|aberta), numero, enunciado, alternativa_a/b/c/d/e, gabarito, comentario, dificuldade`
- **exam_attempts** — `id, user_id, prova_id, modo, score, total, finalizada, created_at`
- **attempt_answers** — `id, attempt_id, questao_id, resposta, acertou, nota_parcial`

### RLS
- `provas` e `questoes`: RLS desativado (conteúdo público)
- `exam_attempts` e `attempt_answers`: RLS ativado com políticas por `user_id`

## Variáveis de ambiente (Vercel)
- `ANTHROPIC_API_KEY` — chave da API do Claude
- `NEXT_PUBLIC_SUPABASE_URL` — não usado (URL hardcoded em supabase.js por ora)
- `NEXT_PUBLIC_SUPABASE_KEY` — não usado (key hardcoded em supabase.js por ora)

## Funcionalidades implementadas
- [x] Design premium dark mode (MedBase)
- [x] Seleção de período e matéria dinâmica (Supabase)
- [x] Sistema de provas interativo (timer, gabarito, navegação)
- [x] Questões abertas com autoavaliação (25/50/75/100%)
- [x] Autenticação completa (login, cadastro, logout)
- [x] Perfil do aluno (estatísticas, histórico, gráfico)
- [x] Painel admin protegido por e-mail
- [x] Extração automática de questões de PDFs via Claude API
- [x] Modo manual (colar JSON)
- [x] Serverless function no Vercel (sem CORS)

## Funcionalidades pendentes
- [ ] Simulados personalizados (aluno escolhe matérias, quantidade, dificuldade)
- [ ] Análise de pontos fracos por IA
- [ ] Resumos e materiais de estudo
- [ ] Toggle dark/light mode funcional em todas as páginas

## Admin
- Apenas o e-mail `filipenqs@hotmail.com` tem acesso ao `/admin.html`
- Para adicionar provas: preencher matéria/período/ano/semestre, fazer upload do PDF e clicar em "Extrair questões com IA"
- Custo estimado: ~R$0,30 por prova processada (Claude Haiku)

## Períodos cadastrados
- 1º ao 8º período + Internato
- Matérias: SOI, HAM, IESC, MCM, CI, CC, GO, PED, CM, APS, UESM e outras

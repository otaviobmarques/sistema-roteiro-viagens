# Rotta 365 · Roteiros de viagem

SaaS web + PWA de roteiros de viagem (escopo v1.6). Produção: https://rotta365.vercel.app

## Stack
- **Next.js 15** (App Router) + TypeScript + Tailwind v4 — hospedado na **Vercel** (região `gru1`)
- **Supabase** (Postgres, Auth, Realtime, RLS) — projeto `rotta365` (sa-east-1)
- **IA:** Claude Haiku 5.5 (`src/lib/ai/claude.ts`; troque com a variável `AI_MODEL`)
- **Lugares:** base própria a partir do OpenStreetMap (Nominatim/Overpass) e Wikidata, guardada na tabela `places`
- **Mapas:** MapLibre GL + OpenFreeMap · **Clima:** Open-Meteo · **Feriados:** BrasilAPI / Nager.Date · **Câmbio:** Frankfurter
- **Pagamentos:** Asaas (Pix) com webhook idempotente

## Variáveis de ambiente (Vercel)
| Nome | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente Supabase |
| `NEXT_PUBLIC_SITE_URL` | URL pública (links de convite, webhook) |
| `INTERNAL_SECRET` | segredo das funções `create_order_record`/`confirm_payment` (igual ao de `private.secrets`) |
| `ANTHROPIC_API_KEY` | IA (o Pino). Sem ela, o app funciona sem geração automática |
| `AI_MODEL` | padrão `claude-haiku-5-5` |
| `ASAAS_API_KEY`, `ASAAS_ENV` (`sandbox`/`production`), `ASAAS_WEBHOOK_TOKEN` | Pix dos créditos |

## Banco
Migrações em `supabase/migrations` (já aplicadas no projeto). Regras de negócio importantes ficam no banco:
RLS por viagem, débito de crédito atômico (`consume_credit`), confirmação de pagamento só por webhook (`confirm_payment`).

## Desenvolvimento
```bash
npm install
npm run dev
npm test        # motor de agenda, divisão de gastos, Pix, score, multidestino
```

## O que está no MVP
Landing, cadastro/login, onboarding (perfil e interesses com peso), painel, criação com o Pino (multidestino com ordem e
divisão automática dos dias, prévia grátis, roteiro completo pago por crédito), planejador (cascata de horários, âncoras,
conflitos, score de viabilidade, otimizar ordem, desfazer, lista de ideias, refazer dia / mais leve / mais barato, chat do
Pino com ações confirmáveis e desfazer em 15 min), comparar perfis, mapa, reservas (manual e leitura de PDF/print com
revisão), gastos e divisão com acerto via Pix, grupo (convites, papéis, enquetes, chat em tempo real), mala e checklist,
modo Hoje, página pública, PDF, .ics, resumo para WhatsApp, carteira e checkout Pix, perfil/LGPD, notificações,
explorar lugares, me surpreenda e backoffice (métricas, usuários, créditos, gerações, gateway).

Próximas fases (escopo, seção 17): Rotta 365 Pro, marketplace, app nas lojas, offline completo, e-mail de reservas,
diário e retrospectiva, Google Places para notas e avaliações.

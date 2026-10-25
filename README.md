# gameDoro

Timer de foco gamificado (Pomodoro). Um herói pixel art caminha em direção à bandeira enquanto você foca; cada fase rende **gemas**, **XP** e **quilômetros**, que desbloqueiam **mundos**, **roupas** e **checkpoints**. Funciona como visitante (progresso no navegador) ou com **conta** (progresso no servidor, amigos e ranking).

## Rodar
Requer Node.js 22.13+.

    npm install
    npm start            # http://localhost:3005
    npm test             # testes de ponta a ponta da API
    npm run smoke   # teste do frontend em navegador simulado
    npm run preview      # gera preview.png da arte (sem navegador)

Variáveis: `PORT`, `DATA_DIR` (SQLite, padrão `./data`), `SECRET` (assinatura dos tokens; se ausente, é gerado em `DATA_DIR/.secret`), `NODE_ENV=production` (cache dos estáticos).

## Estrutura
- `server.js`: API Express + SQLite (`node:sqlite`, sem dependência nativa)
- `public/shared.js`: regras e catálogos usados pelo servidor **e** pelo navegador (uma única fonte da verdade)
- `public/scene.js`: motor de pixel art (sprites, parallax, 4 mundos, ciclo de caminhada). Usa só `fillRect`, então roda em canvas e em rasterizador de teste (`tools/render.js`)
- `public/app.js`, `index.html`, `style.css`: interface
- `tools/`: preview da arte e teste de fumaça

## Regras do jogo
1 gema a cada 2 min focados + 5 de bônus ao completar a fase; 4 XP e 0,2 km por minuto; nível a cada 400 XP; sequência conta dias com 10+ min. Pausar ou encerrar credita os minutos já focados. O servidor só credita minutos que o relógio dele confirma (anti-trapaça).

## API (JSON, `Authorization: Bearer <token>`)
| Rota | Função |
|---|---|
| `POST /api/auth/register` · `/login` | conta e sessão |
| `GET /api/me` | perfil e estado |
| `PUT /api/settings` | durações, ciclos, som, alertas |
| `POST /api/sessions/start` · `/sync` | inicia fase; credita (`pause`, `stop`, `complete`) |
| `POST /api/shop/buy` · `PUT /api/equip` | loja de mundos e roupas |
| `GET /api/history` | 30 dias, totais e últimas fases |
| `GET/POST/DELETE /api/friends` | amigos por código |
| `GET /api/ranking` | top 20 dos últimos 7 dias |

## Publicar
Host de Node com **disco persistente** (Render, Railway, Fly.io, VPS), HTTPS, `SECRET` definido e `DATA_DIR` no disco.

## Limites atuais
Sem recuperação de senha por e-mail; amigos são adicionados direto por código (sem convite), e o progresso de visitante não migra para a conta.

## Novos recursos

- **Grupo:** crie uma sala ou entre pelo código. Até 6 heróis compartilham o mundo escolhido na criação; presença e progresso atualizam a cada 15 segundos. Cada participante controla seu próprio timer. Depois de 45 segundos sem atualização, aparece ausente.
- **Chefão semanal:** 600 minutos coletivos derrotam o Guardião da Distração. A semana começa segunda às 00h UTC. Só entram minutos de sessões iniciadas na sala, creditados ao pausar/encerrar. Sair da sala não transfere créditos para outra.
- **Desafios:** convide amigos apostando 1–500 gemas. As apostas ficam reservadas e, após o aceite, começa uma disputa de 7 dias. Só contam sessões iniciadas após o aceite. O vencedor recebe as duas apostas; empate, recusa ou convite expirado devolvem as reservas. A liquidação ocorre ao consultar o grupo ou interagir com desafios, em transação, uma única vez.
- **Cartão:** na aba Fase, baixe um PNG de 1200 × 800 com sua cena pixel art, heróis presentes e conquistas. O download não publica nada automaticamente.
- **Aventura:** missões de 30 minutos e 3 fases por dia; conquistas de 7 dias de sequência e 10 horas de foco; baú de 20–60 gemas após 120 minutos semanais; proteção do dia anterior por 25 gemas. A proteção requer foco no dia anterior à falta, preserva a sequência e não fabrica minutos nem dias focados.
- **Habilidades:** três níveis em Sabedoria (+10% XP por nível) e Fortuna (+1 gema por 10 minutos por nível), com custos de 50, 100 e 150 gemas. Valores fracionários são arredondados para baixo por sessão.
- **Pet e história:** evolução visual após 5 e 20 horas; sete capítulos revelados nos checkpoints do mapa.
- **Foco:** tarefa e projeto por sessão, preset 52/17, cronômetro livre sem contagem regressiva, pausas orientadas e lembretes 20-20-20. O modo livre registra minutos ao pausar/encerrar, sem bônus de fase completa.
- **Modo estrito:** sair da aba durante o foco custa um dos três corações. Ao perder todos, a fase pausa preservando os minutos; encerre a fase para começar outra com novos corações. É uma regra da interface, não um bloqueador de aplicativos.
- **Diário:** minutos por projeto, horário com maior volume de foco após cinco registros e taxas de conclusão por duração após três fases comparáveis. Visitantes usam os últimos 50 registros locais para esses detalhes.
- **Ambiente:** dia, entardecer e noite pelo relógio local; chuva/neve selecionáveis; três controles independentes de áudio sintetizado (chuva, fogueira e vento). Os sons do mixer continuam até seus volumes serem zerados.

Salas e apostas exigem conta. Progressão e recursos individuais funcionam também como visitante. As migrações SQLite são aplicadas ao iniciar, preservando os registros existentes. As novas missões contabilizam minutos registrados a partir desta atualização; pets e mapa usam todo o histórico.

### API adicional

| Rota | Função |
|---|---|
| `GET /api/coop` | sala, chefão, desafios e saldo atualizado |
| `POST /api/rooms` · `/rooms/join` | criar ou entrar por código |
| `POST /api/rooms/presence` | atualizar presença/estado de foco |
| `DELETE /api/rooms/membership` | sair da sala |
| `POST /api/challenges` | reservar aposta e convidar amigo |
| `POST /api/challenges/:id/respond` | aceitar ou recusar convite |
| `POST /api/progression` | resgatar missão, abrir baú, congelar dia, evoluir habilidade |

`/sessions/start` aceita `task`, `project` e `free`. Para modo livre use `free: true, planned: 0`; para Pomodoro, `planned` de 1 a 120. `/history` inclui projetos e taxas por duração.

### Verificação

    npm test               # regressões da API original
    npm run test:features  # regras de cooperação, apostas e progressão
    npm run smoke          # fluxos da interface em JSDOM

Áudio real, exportação PNG e comportamento visual responsivo ainda devem ser conferidos em navegador real; JSDOM simula o canvas e não reproduz áudio.

## Compra de gemas — AbacatePay

O checkout PIX usa a API v1 (`POST /v1/billing/create`). Os pacotes são definidos no servidor: 5 gemas/R$ 1,99, 15/R$ 4,99, 40/R$ 11,99 e 100/R$ 27,99. É necessário entrar na conta para comprar.

1. Copie `.env.example` para `.env`. O servidor carrega esse arquivo ao iniciar; variáveis já definidas no ambiente têm prioridade.
2. Preencha `ABACATEPAY_API_KEY` com sua chave **compatível com API v1**, `APP_URL` com a URL pública da aplicação e `ABACATEPAY_WEBHOOK_SECRET` com um segredo aleatório. Nunca coloque esses segredos nos arquivos de `public/`.
3. No painel AbacatePay, cadastre o webhook `https://SEU-DOMINIO/api/payments/webhook`, informe o mesmo secret e habilite o evento `billing.paid`. O provedor envia o secret no parâmetro `webhookSecret`. O servidor valida também `X-Webhook-Signature` sobre o corpo original.
4. Use chave e webhook do mesmo ambiente. Para testes, mantenha `ABACATEPAY_DEV_MODE=true`; para cobranças reais, use chave e webhook de produção com `ABACATEPAY_DEV_MODE=false`. Testes devem usar um banco separado (`DATA_DIR`) para não misturar gemas simuladas com contas reais.
5. Reinicie com `npm start`, entre na conta e abra **Loja → Pacotes de Gemas → Comprar com PIX**. O AbacatePay coleta os dados do comprador no checkout. Em desenvolvimento, o webhook precisa de uma URL HTTPS pública que encaminhe ao servidor local.

As gemas só entram após o webhook autenticado confirmar o valor e o ambiente da cobrança. O retorno do checkout consulta a confirmação por até 90 segundos e atualiza o saldo; retornar pela URL, sozinho, não concede gemas. Se a confirmação demorar mais, recarregue a página depois. Notificações repetidas não duplicam o crédito. Sem configuração, a loja mostra indisponibilidade e desabilita a compra.

Validação local: `npm run test:payments` usa banco temporário e respostas simuladas do provedor; não cria cobranças reais. Para homologar, faça uma compra em Dev mode e confira a entrega do webhook no painel. A ativação em produção depende das credenciais e do webhook configurado no painel.

Referências: [criação de cobrança v1](https://abacatepay.readme.io/reference/postbillingcreate), [eventos v1](https://docs.abacatepay.com/pages/v1/webhooks), [segurança de webhooks](https://docs.abacatepay.com/pages/webhooks). A API v2 usa outro contrato e não é utilizada nesta integração.

### Compatibilidade e correções da Sprint 0

A API legada de missões (`/api/missions/complete`) mantém IDs e recompensas, mas agora exige minutos creditados no dia da missão e permite apenas um resgate. A migração adiciona `goal_minutes` sem apagar registros: descrições antigas no formato `Concluir N minutos de foco` (1–120) são reconhecidas; objetivos desconhecidos ou zero ficam indisponíveis para resgate. Novas missões de modo livre exigem 30 minutos. A Aventura continua usando as regras compartilhadas de progressão.

O chat legado da API é **global**, não privado por sala. Mensagens devem conter 1–500 caracteres após remover espaços externos; há limite de 20 tentativas por minuto por usuário. Os limites de autenticação e adição de amigos usam contadores separados. A interface de Grupo conserva salas e desafios; scripts legados sem autenticação não são mais carregados.

`npm run test:features` inclui regressões da Sprint 0: banco legado, resgate repetido, requisito de foco, isolamento entre contas, rollback e limites. Todas as suítes usam bancos temporários e segredos próprios de teste. O smoke executa os módulos explicitamente no JSDOM; áudio, PNG e layout ainda precisam de navegador real.

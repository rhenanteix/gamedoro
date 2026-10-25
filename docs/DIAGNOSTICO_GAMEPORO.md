# Diagnóstico do gameDoro

Análise em 24/10/2026. O nome deste arquivo preserva exatamente o solicitado. Escopo desta entrega: documentação; nenhuma regra, dependência, migração ou implementação foi alterada. Evidências são do repositório local, não de uma auditoria do provedor de pagamentos ou de produção.

## 1. Parecer executivo

O produto já tem um loop completo: escolher tarefa → focar → registrar minutos → receber progressão → personalizar → voltar sozinho ou com amigos. A principal necessidade é consolidar os fluxos existentes. Recomendo corrigir a emissão ilimitada de recompensas da API legada, tornar os testes confiáveis e estabilizar sessão/autenticação antes de acrescentar novas moedas ou sistemas sociais.

Pontos fortes: regras compartilhadas em `public/shared.js` e `public/progression.js`; créditos incrementais; transações SQLite envolvendo saldo e cooperação; webhook com corpo original e crédito condicionado à transição de status; visitante funcional; renderer independente de DOM que usa `fillRect`; estados de carregamento e escape de conteúdo na interface principal.

Limites: um processo Node, SQLite síncrono e disco persistente. Isso é uma base razoável para o tamanho atual; não há medição de carga que justifique microserviços, Redis ou trocar de banco agora. Os arquivos são curtos em linhas, mas várias linhas concentram funções inteiras, SQL, regras e templates.

## 2. Base examinada e validação

Leitura integral de `README.md`, `package.json`, `server.js`, `cooperative.js`, todos os arquivos de `src/`, `public/shared.js`, `public/progression.js`, `public/app.js`, `public/index.html`, `public/style.css`, `public/scene.js`, `public/mission.js` e `public/payments.js`. Leitura complementar das três suítes da API, `tools/smoke.js`, `tools/render.js`, `.env.example` e `public/landing.js`. `public/chat.js` não existe. Não foram lidos bancos nem segredos locais.

Testes executados com Node 22.22.3, bancos temporários dos próprios testes e `SECRET` exclusivo de teste. A primeira execução foi bloqueada por `listen EPERM` no sandbox; a execução com permissão de portas locais produziu:

| Comando | Resultado observado | Interpretação |
|---|---|---|
| `npm test` | Passou | Regressões originais cobertas |
| `npm run test:features` | Falhou em `test-features.js:24`: 90 ≠ 95 | Espera bônus 10; `P.missions` define 5, como o README |
| `npm run test:payments` | Passou | Provedor simulado; inclui assinatura, repetição e UI da loja |
| `npm run smoke` | Falhou em `tools/smoke.js:17`: saldo vazio | JSDOM não executa o `app.js` carregado como módulo; o teste de pagamentos já contorna isso explicitamente |

Logo, não é correto afirmar que a baseline inteira está verde. A suíte de recursos para no primeiro erro: o restante não foi validado nesta execução. Não houve homologação PIX real, teste de carga nem inspeção visual em navegador real. Achados abaixo distinguem comportamento demonstrável por leitura de riscos que exigem reprodução específica.

## 3. Arquitetura e middlewares

```text
Navegador
  app.js: Store (visitante/API), timer, rotas hash, views, áudio, coop
  shared.js + progression.js: regras compartilhadas via globais/UMD
  scene.js: renderer independente; payments.js: módulo ES com cliente injetado
      ↓ fetch JSON / Bearer
server.js: configuração → SQLite/migrações → Express → módulos → estáticos
  auth utils / cooperative / missions / achievements / chat / payments
      ↓ conexão injetada + BEGIN IMMEDIATE
SQLite: saldo, sessões, progressão JSON, social, pagamentos
```

Ordem HTTP: desabilita `x-powered-by`; `trust proxy=1`; headers CSP, nosniff, DENY e referrer; JSON até 100 KB com captura de corpo original do webhook; rotas; fallback JSON `/api` 404; estáticos; tratador de erros. JSON malformado recebe 400; outros erros chegam a 500 genérico. O erro de corpo grande não recebe tratamento específico 413. O `bad()` retorna `{error: texto}` sem código estável.

Autenticação: senha com sal aleatório e scrypt síncrono; token próprio `payload.assinatura`, HMAC e expiração de 30 dias (não é JWT de três segmentos, apesar dos comentários). O middleware valida token e existência do usuário. Não há revogação persistida nem recuperação de senha. Token fica em localStorage; CSP reduz superfície, mas não torna um eventual XSS inofensivo.

## 4. Mapa completo das rotas

Todas as rotas abaixo têm prefixo `/api`. “Conta” significa Bearer válido. Datas de cliente passam por `todayOf`, com janela inferior a dois dias em relação ao relógio do servidor.

| Método e caminho | Acesso | Entrada / efeito / saída principal | Implementação |
|---|---|---|---|
| GET `/health` | Público | `{ok:true}`; não verifica saúde do banco | server |
| POST `/auth/register` | Público + limite IP | nome, email, password, today; cria usuário, itens, 50 gemas; token/user/state, 201 | server |
| POST `/auth/login` | Público + limite IP | email/password/today; token/user/state | server |
| GET `/me` | Conta | user/state: saldo, histórico recente, progressão, totais, itens | server |
| PUT `/settings` | Conta | configuração completa validada por `clampCfg`; user/state | server |
| POST `/sessions/start` | Conta | planned, free, task, project, day; substitui ativo; `{ok:true}` | server |
| POST `/sessions/sync` | Conta | minutes cumulativo, final pause/stop/complete, day; user/state | server |
| POST `/shop/buy` | Conta | item `skin:id` ou `world:id`; compra atômica; user/state | server |
| PUT `/equip` | Conta | kind/id já adquirido; user/state | server |
| GET `/history` | Conta | days, sessions, projects, hours, durations, totals | server |
| GET `/friends` | Conta | code e lista com nível/minutos semanais | server |
| POST `/friends` | Conta + limite IP | code; amizade bilateral imediata; 201 | server |
| DELETE `/friends/:id` | Conta | apaga as duas relações; ok | server |
| GET `/ranking` | Conta | top 20 e posição/minutos do próprio usuário | server |
| POST `/progression` | Conta | action claim/skill/freeze/chest e id quando aplicável; user/state | server + P |
| GET `/coop` | Conta | liquida desafios vencidos; room/challenges/gems | cooperative |
| POST `/rooms` | Conta | name; mundo equipado, membro fundador; code, 201 | cooperative |
| POST `/rooms/join` | Conta | code; limite de 6 membros; ok | cooperative |
| POST `/rooms/presence` | Conta | focusing booleano; atualiza seen; ok | cooperative |
| DELETE `/rooms/membership` | Conta | remove associação; ok | cooperative |
| POST `/challenges` | Conta | friend/stake 1–500; reserva saldo; 201 | cooperative |
| POST `/challenges/:id/respond` | Conta destinatária | accept; reserva ou devolve saldo; ok | cooperative |
| GET `/missions` | Conta | missões SQL do dia | missions |
| POST `/missions/complete` | Conta | missionId; concede saldo/XP sem comprovar objetivo | missions |
| GET `/achievements` | Conta | achievements SQL; não há escritor no código examinado | achievements |
| GET `/chat` | Conta | últimas 50 mensagens globais por ts DESC | chat |
| POST `/chat` | Conta | message; grava mensagem; ok | chat |
| GET `/payments/packages` | Conta | packages/available/message | payments |
| POST `/payments/create` | Conta | packageId; cria billing v1; checkoutUrl/reference | payments |
| GET `/payments/:reference` | Conta proprietária | status/gems | payments |
| POST `/payments/webhook` | Secret de query + assinatura | billing.paid; valida valor/ambiente, credita uma vez | payments |

O GET de cooperação tem efeito de escrita intencional. Não o colocar em cache de resposta nem trocar sua semântica durante uma extração. `/` serve o app; `landing.html` é um arquivo estático separado.

## 5. Schema SQLite e integridade

| Tabela | Campos relevantes e chaves | Relações / observações |
|---|---|---|
| users | id PK; name/email/pass/code; gems/xp/skin/world/cycle/cfg/created_at | email e code UNIQUE; cfg JSON texto |
| owned | PK(user_id,item) | FK users com CASCADE |
| sessions | id PK; user_id,minutes,day,world,completed,at; task/project/room/free/planned adicionados | FK users CASCADE; índice `(user_id,day)` |
| active | user_id PK, session_id,planned,started_at,credited | FK user CASCADE; session_id sem FK |
| friends | PK(user_id,friend_id) | ambas FK users CASCADE; bilateralidade mantida pela aplicação |
| missions | id PK; user_id,day,description,completed,reward_gems,reward_xp | FK users CASCADE; sem índice user/dia nem unicidade da missão |
| chat_messages | id PK; user_id,message,ts | FK users CASCADE; sem índice de ordenação ts |
| achievements | id PK; user_id,name,earned_at,description | FK users CASCADE; sem escritor identificado |
| payments | id PK; user_id,package_id,reference,status,created_at; provider_id,checkout_url,amount,gems,dev_mode adicionados | FK users CASCADE; provider_id UNIQUE; reference não é UNIQUE |
| progression | user_id PK, data JSON texto | FK users, sem CASCADE; dias, resgates, freezes e baús crescem no JSON |
| rooms | code PK,name,world | não há limpeza de salas vazias |
| room_members | user_id PK,room,seen,focusing | FK users e rooms; sem índice secundário room |
| room_focus | PK(room,week,user_id),minutes | sem FKs |
| challenges | id PK,sender,recipient,stake,starts,ends,status,winner | sem FKs, CHECKs ou índices secundários |
| challenge_focus | PK(challenge,user_id),minutes | sem FKs |

WAL e foreign_keys estão ativos. Há três pontos de DDL: server, cooperative e payments. As adições são idempotentes por inspeção de `PRAGMA table_info`, mas não existe versão/migração auditável. `src/db.js` abre outra conexão ao ser importado; atualmente não é usado pelo servidor. Não consolidar importando-o sem remover a abertura anterior.

Índices candidatos, a validar por `EXPLAIN QUERY PLAN` e massa representativa: sessions(day,user_id) para ranking; sessions(user_id,at) para recentes; missions(user_id,day); room_members(room); challenges(status,ends), sender e recipient; chat_messages(ts,id); payments(reference) único somente após checar duplicatas legadas. Índices existentes de PK/UNIQUE já atendem os placares compostos. Não criar todos sem medir custo de escrita.

N+1 comprovado: `/friends` executa `weekMin` para cada amigo; `/coop` lê dois placares por desafio (até 60 consultas adicionais). `/history` retorna todos os registros positivos em hours, sem limite temporal. `state` agrega todo o histórico, consulta progressão duas vezes e devolve o JSON inteiro. São riscos de crescimento, sem latências medidas. scryptSync e DatabaseSync compartilham o event loop; picos de login também podem atrasar timers HTTP.

## 6. Fluxos e invariantes

### Foco e crédito

Start captura sala, mundo e metadados, cria sessions/active em transação e uma missão SQL quando ainda não existe no dia. Um novo start remove o ativo anterior e sua sessão se tinha zero minutos; minutos ainda não sincronizados se perdem. Sync recebe total cumulativo; usa `m=max(min,credited)` e concede apenas a diferença. O teto de relógio é `floor((agora-started_at)/60000)+1`: há tolerância de um minuto, portanto uma fase de 1 minuto pode ser concluída imediatamente. `GAMEDORO_FAST` com qualquer string não vazia desativa esse teto, inclusive `'0'`.

Na mesma transação: crédito de sala/desafio, progressão, bônus por habilidade, saldo/XP/ciclo e sessão. Pause conserva active; stop/complete remove. Modo livre exige planned=0, não permite complete e não ganha bônus de conclusão. Arredondamentos por total cumulativo evitam ganhos extras pela fragmentação de pausas. O relógio mede tempo desde o start e não exclui tempo pausado; a UI é quem envia minutos efetivamente focados. Isso limita tempo de parede, não comprova atenção humana.

Datas: sync reatribui **todos** os minutos de sessions.day ao dia recebido; P.credit registra somente o delta nesse dia. Uma sessão atravessando meia-noite pode divergir entre histórico e missões. O visitante distribui deltas no hist, mas conserva o dia inicial no registro local. Preservar comportamento na extração e criar decisão explícita para corrigir datas depois.

### Cooperação e desafios

Sala da sessão é fixada no start: sair ou entrar em outra não redireciona crédito. A semana do boss é calculada no momento do sync, segunda UTC; goal=600. Presença por polling a cada 15 s, online por 45 s. Desafios reservam a aposta de cada participante; começam no aceite e duram sete dias; só entram sessões com at>=starts e sincronizadas antes de ends. Minutos ainda não enviados no vencimento não entram. Liquidação em transação ocorre no GET coop, criação e resposta; empate ou expiração pendente devolvem reservas uma vez.

### Progressão e visitante

P mantém missões de 30 minutos/3 fases, conquistas de 7 dias/600 minutos, skills até 3, baú de 120 minutos semanais e freeze de ontem por 25. Freeze exige foco no dia anterior à falta; não inventa minutos nem aumenta o número de dias focados. Pets usam total histórico; missão de 600 usa `progress.total`, contabilizado desde a implantação da progressão. `normalize` é preenchimento raso, não validador profundo; `credit` e `action` compartilham estruturas internas mutáveis.

Visitante guarda `gamedoro:guest:v2`, até 50 registros detalhados e histórico agregado. O timer T não é reidratado do active local; Store.start nem persiste imediatamente. Recarregar perde a continuidade visual. Conta também não recebe active em `/me`. Login/logout chama setMode e pode abandonar foco não sincronizado. Não há importação de visitante para conta; importar minutos locais para ranking seria uma nova superfície de fraude.

### Pagamentos

Catálogo no servidor; cobrança passa por creating → pending → paid, ou failed. Snapshot de preço/gemas/ambiente evita depender de preços futuros. Rede usa timeout de 15 s. Webhook verifica secret em query, assinatura HMAC sobre bytes originais usando a chave pública de integridade do provedor, evento, cobrança, valor e ambiente. O secret privado continua indispensável. Só o UPDATE pending→paid concede gemas, dentro da mesma transação. Retorno de checkout consulta por até 90 s e nunca credita por si só.

Risco operacional a validar: provedor cria cobrança, mas resposta se perde; registro local fica failed sem provider_id e não existe reconciliação. Erro de processo após escrita também deixa creating. Webhook desconhecido retorna 503 para permitir retry. Não trocar contrato v1, assinatura ou ambientes com base em suposições; testes atuais simulam o provedor, não atestam o painel real.

## 7. Achados priorizados

| ID | Prioridade / evidência | Problema e efeito | Direção |
|---|---|---|---|
| D01 | P0, leitura conclusiva: src/missions.js | Repetir complete concede gems/XP novamente; não verifica minutos, data ou completed; permite recompensa sem foco | Condicionar resgate e objetivo em transação; preservar endpoint e registros |
| D02 | P1, leitura conclusiva: auth.js | Ignora DATA_DIR ao resolver segredo; server cria um segredo que auth não usa | Injetar configuração única e preservar chave realmente usada em instalações existentes |
| D03 | P1, leitura conclusiva: index/mission | chat.js ausente; mission.js faz fetch sem Bearer; scripts carregam mesmo em seção hidden; renderCoop substitui o container | Desconectar UI legada quebrada; manter APIs até migração |
| D04 | P1, testes executados | Features espera recompensa incorreta; smoke não inicia módulo | Corrigir harness/expectativa comprovada sem alterar economia |
| D05 | P1, leitura conclusiva: server limiter | Um Map por IP compartilhado por limites 20 e 30; amigos interferem em login; proxy fixo | Escopar buckets e configurar proxy; teste de isolamento |
| D06 | P1, leitura conclusiva: sessions | FAST habilitável em produção; tolerância permite fase 1 min imediata | Guardar FAST por ambiente de teste; caracterizar tolerância antes de mudar |
| D07 | P1, leitura conclusiva: app/server | Reload e troca de conta não retomam nem finalizam foco; data de sync move histórico integral | Recuperação explícita; regra de dia em mudança isolada |
| D08 | P1, leitura conclusiva: chat | Chat é global apesar do rótulo equipe; whitespace passa validação; sem limite específico/tamanho após trim | Limitar e documentar agora; sala e privacidade em contrato separado |
| D09 | P2, leitura conclusiva: style/app | Ajustes desaparecem <=640px; sem alternativa; reduced-motion só afeta CSS, não canvas | Restaurar acesso e respeitar preferência no loop |
| D10 | P2, leitura conclusiva: history/coop | N+1, resposta ilimitada hours, JSON crescente e liquidação global sob GET | Medir, agregar e indexar incrementalmente |
| D11 | P2, risco operacional: payments | Sem reconciliação para creating/failed ambíguo; criação sem limite dedicado | Estado operacional e limites; não repetir POST automaticamente |
| D12 | P2, leitura conclusiva: auth verify | Compara comprimento em caracteres antes de timingSafeEqual de bytes; assinatura Unicode pode lançar exceção | Validar alfabeto/formato e comparar bytes; token malformado deve dar 401 |
| D13 | P2, leitura conclusiva: app boot | Falha de rede em /me usa estado visitante mas mantém TOKEN; UI pode mostrar saldo local enquanto mutações vão ao servidor | Estado explícito de conexão; não misturar identidades |

D01 é falha de integridade da economia e deve ser corrigida antes de ampliar aquisição paga. Correção de abuso não é preservação de comportamento indevido: compatibilidade significa conservar fluxos legítimos, formatos e dados.

## 8. Frontend, UX e dívida técnica

App usa escopo fechado, não dezenas de variáveis no window; ainda assim TOKEN/USER/S/L/T/roomData são estado compartilhado dentro de uma grande IIFE. Já existe um Store e um cliente api: extrair e fortalecer esses pontos evita criar abstrações concorrentes. Pay já recebe api por injeção. RENDER concentra templates grandes; rotas assíncronas e polling podem aplicar respostas de uma identidade anterior após logout. Há guarda `polling`, mas não geração de autenticação/AbortController.

O loop desenha apenas as views visíveis, mas agenda rAF continuamente; cena em idle ainda anima. tick a cada 250 ms escreve texto/DOM mesmo sem mudança de segundo. Scene já compila sprites e faz cache: medir antes de trocar o renderer. `fogged` usa dimensão como identidade do sprite, risco de colisão em novos assets; fallback de mundo em render não é propagado a fogged. Cobrir mundo inválido antes de prometer robustez do fallback.

Áudio ambiente tem stop de fontes; mixer mantém fontes mesmo com ganho zero, conforme comportamento documentado. Não há descarte central de nós nem erro de persistência mostrado. Event listeners e intervals vivem pela página inteira; isso ainda é simples, mas módulos futuros precisam mount/dispose. Respeitar que mixer continua nas pausas é requisito de compatibilidade.

Acessibilidade existente: labels, switches, diálogos nativos rotulados, toast role=status e outline visível. Lacunas: aria-current na navegação, foco após mudança de view, alternativa textual/tabela ao gráfico com title, nome do progress de boss e redução de movimento efetiva. Não transformar o relógio em live region a cada tick. Mobile tem navegação horizontal extensa e Ajustes oculto; tema já responde ao sistema, não precisa ser recriado.

Duplicações: abertura DB/secret, datas dayAdd/addDays, catálogo cat/catalog, cálculo bônus visitante/conta, missões SQL versus P.missions. Achievements SQL não é a conquista exibida pela aventura. README diz porta 3004 onde o default é 3005; também diz “sem pagamentos” apesar da integração, e manda instalar jsdom já declarado. `.env.example` cobre PIX, mas não documenta PORT/DATA_DIR/SECRET/NODE_ENV.

## 9. Produto e decisão de lançamento

O diferencial é o foco com companhia visual, não a quantidade de sistemas. Onboarding sem conta, retomada confiável e mobile acessível precedem guildas e passe. Ranking mede minutos, não XP; contudo gemas compradas financiam skills e apostas, portanto a economia não é puramente cosmética. Novas vendas devem ser cosméticas, sem apagar direitos adquiridos nem converter silenciosamente saldos existentes.

Critério para próxima versão: D01 fechado com testes negativos; baseline verde de verdade; nenhuma regressão em crédito/saldo; visitante e conta reconhecíveis; configurações acessíveis no celular. Coletar métricas antes de alegar melhoria de retenção. Arquitetura, ideias, sequência e prompt estão nos quatro documentos complementares.

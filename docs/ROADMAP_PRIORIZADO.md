# Roadmap priorizado

Plano executável em três horizontes, para uma pessoa familiarizada com o código. Faixas de 1–2, 2–4 e 4–7 dias são orçamento por horizonte para o recorte principal, não promessa de concluir todo o backlog. Itens opcionais de Sprint 2+ seguem em novos ciclos de 4–7 dias. Impacto é estimado; esforço inclui validação; risco mede chance de regressão.

Baseline de 24/10/2026: API original e pagamentos passam; features falha por expectativa 10 versus recompensa 5; smoke falha por saldo vazio, com harness que não executa app como módulo. Não começar extração com essa divergência ocultada.

## Sprint 0 — Quick wins (1–2 dias)

Ordem principal: S0.1 → S0.2 → S0.3 → S0.4. Segurança e baseline têm precedência sobre polimento; se não couberem, mover polimento para o início da Sprint 1.

| ID / objetivo | Impacto | Esforço | Risco | Arquivos afetados | Como testar | Critério de aceite |
|---|---|---|---|---|---|---|
| S0.1 Tornar baseline confiável | Alto | Baixo | Baixo | test-features.js, tools/smoke.js, test.js, test-payments.js, package.json | Executar as quatro suítes; smoke deve executar app/Pay explicitamente; falhar se servidor não subir | Expectativa da missão corresponde a 5, preservando catálogo; smoke percorre visitante/conta; nenhuma asserção eliminada para esconder bug |
| S0.2 Impedir recompensa ilimitada da missão SQL | Alto | Médio | Médio | src/missions.js, server.js, teste de missões novo, migração aditiva se necessária | Resgate válido, repetição, sem minutos, outro usuário, dia antigo, missão legada e modo livre | Um único crédito após requisito comprovado; IDs/valores/completed antigos preservados; zero objetivo não dá prêmio automático |
| S0.3 Eliminar inicialização quebrada de missões/chat | Alto | Baixo | Baixo | public/index.html, public/mission.js, tools/smoke.js | Inspecionar carregamento de módulos e requests em navegador; entrar em Grupo e Aventura como visitante/conta | Nenhuma referência a chat.js inexistente nem fetch de missão sem Bearer; Grupo conserva salas/desafios; APIs legadas não são removidas |
| S0.4 Restaurar Ajustes no celular e alinhar setup | Médio | Baixo | Baixo | public/style.css, public/index.html se menu, README.md, .env.example | 320/375/640 px, zoom 200%, teclado; setup com npm ci/start | Ajustes acessível sem overflow impeditivo; README porta 3005, pagamentos e jsdom coerentes; env sem valores secretos |
| S0.5 Limitar chat e corrigir buckets de rate-limit | Alto | Médio | Médio | src/chat.js, server.js, futuro src/middlewares/rate-limit.js, testes HTTP | Whitespace, limite de caracteres, excesso de POST; limite amigos não esgota login; IP/proxy | Trim antes de validar; limite explícito e erro JSON; buckets independentes; não apresentar chat global como privado |

S0.5 é reserva de capacidade e pode iniciar Sprint 1. Para chat, adotar limite documentado de 500 caracteres e limite inicial configurável por usuário; medir uso legítimo antes de apertar. Compatibilidade não exige aceitar mensagens vazias ou abuso.

Branches: `fix/baseline-tests`, `fix/legacy-mission-claims`, `fix/feature-bootstrap`, `fix/mobile-settings`, `fix/request-limits`. Um PR por correção com cenário antes/depois e resultado das suítes. Não misturar formatação global.

## Sprint 1 — Arquitetura (2–4 dias)

Recorte principal: S1.1, S1.2 e S1.3; S1.4/S1.5 entram apenas se a base estiver estável. Dependências: toda mudança parte de S0.1; sessão depende da fábrica DB; frontend depende de S0.3.

| ID / objetivo | Impacto | Esforço | Risco | Arquivos afetados | Como testar | Critério de aceite |
|---|---|---|---|---|---|---|
| S1.1 Unificar configuração/segredo e proteger FAST | Alto | Médio | Alto | server.js, src/config/index.js novo, src/utils/auth.js, .env.example, subprocessos dos testes | DATA_DIR customizado, reinício com token antigo, SECRET explícito, segredo legado divergente, token Unicode; FAST em produção/teste | Uma resolução de chave; token existente permanece válido por migração segura; sem cópia cega de chave divergente; bypass apenas no ambiente de teste |
| S1.2 Centralizar conexão e versionar migrações | Alto | Médio | Alto | src/db.js, src/db/migrations/* novos, server.js, cooperative.js, src/payments.js | Banco vazio, schema original, parcialmente atualizado e atual; iniciar duas vezes; PRAGMA integrity_check/foreign_key_check | Uma conexão por aplicação; migrações registradas após sucesso; zero perda de saldo, itens, sessões, desafios ou pagamentos |
| S1.3 Extrair sessões mantendo transação única | Alto | Médio | Alto | server.js, src/routes/sessions.js, src/services/session-service.js, src/repositories/sessions.js novos, cooperative.js | Sync incremental e repetido; erro injetado após crédito coop; rollback; free; bonus; data e tolerância atuais | Mesmas rotas/status/JSON; falha reverte saldo, progressão e coop juntos; relógio injetável; nenhum await dentro de tx |
| S1.4 Extrair cliente API e isolar identidade do Store | Alto | Médio | Médio | public/app.js, public/core/api.js, public/core/store.js novos, public/payments.js, harness | 401, timeout, resposta não JSON, GET tardio após logout, falha de /me; loja | Pay usa o mesmo cliente; conta não recebe saldo visitante em falha; resposta de identidade anterior descartada; nenhuma mutação repetida automaticamente |
| S1.5 Reduzir consultas e padronizar erros/logs | Médio | Médio | Médio | server.js, cooperative.js, src/middlewares/errors.js novo, migrações de índices, testes | Massa sintética, EXPLAIN QUERY PLAN, contagem de queries; JSON malformado/grande; inspecionar logs com dados sintéticos | Amigos e placares sem N+1; campos atuais intactos; error mantido e code aditivo; nenhum segredo/texto pessoal em logs; comparação de latência documentada |

Branches: `refactor/config-auth`, `refactor/sqlite-migrations`, `refactor/session-service`, `refactor/client-store`, `perf/query-aggregation`. Não extrair todos os domínios antes de verificar a primeira fatia. `payments.js` continua módulo funcional; migrar seu DDL não implica reescrever webhook.

## Sprint 2+ — Evolução (4–7 dias por ciclo)

Primeiro ciclo: S2.1 e S2.2, mais S2.3 se houver capacidade. Recuperação S2.4 é um ciclo próprio por envolver persistência e identidade. Produto social/monetização entra depois desses fundamentos e de uma baseline de uso.

| ID / objetivo | Impacto | Esforço | Risco | Arquivos afetados | Como testar | Critério de aceite |
|---|---|---|---|---|---|---|
| S2.1 Limitar redraw e respeitar movimento reduzido | Médio | Médio | Baixo | public/app.js, public/scene.js só se necessário, public/style.css, tools/render.js | Frames em 10 s visível/oculto; reduced-motion; quatro mundos; cronômetro durante suspensão | Zero frames novos oculto, limite inicial 30 fps visível, cena estática reduzida; tempo não depende de frames; renderer segue fillRect |
| S2.2 Primeiro foco guiado e layout compacto | Alto | Baixo | Baixo | public/app.js, public/index.html, public/style.css, futuro public/ui/onboarding.js | Primeira visita, dispensar, retorno, conta, teclado e celular | Iniciar sem cadastro; fluxo dispensável; opções continuam acessíveis; nenhuma alteração de recompensa |
| S2.3 Refinar diário e instrumentação mínima | Médio | Médio | Médio | server.js, public/app.js ou public/views/diario.js, testes de histórico, eventual módulo de métricas | Filtros, amostras pequenas, visitante 50 registros, datas/horários e privacidade | Intervalos e amostras explícitos; sem promessa de produtividade; eventos sem conteúdo pessoal; decisão de transmissão visitante explícita |
| S2.4 Recuperar sessão após reload/rede/troca de conta | Alto | Alto | Alto | serviço/rotas de sessões, public/timer/controller.js, adaptadores Store, migrações aditivas, testes de navegador | Reload visitante/conta, resposta perdida de complete, duas abas, offline, login/logout, sessão substituída | Apenas sessão correta aceita sync; confirmação única; reload oferece retomada pausada; zero crédito automático offline; clientes antigos continuam funcionais |
| S2.5 Melhorar status de compra e recuperação operacional | Alto | Médio | Alto | src/payments.js, public/payments.js, public/views/loja.js ou app.js, test-payments.js | Pending >90 s, evento antes de resposta, queda de provedor, webhook duplicado, outro usuário | Status pendente persistente e consulta manual; sem retry cego de cobrança; saldo só por confirmação; creating/failed ambíguos identificáveis para investigação |
| S2.6 Missões rotativas e álbum cosmético | Médio | Médio | Médio | public/progression.js, public/shared.js se catálogo, view aventura, testes puros/HTTP | Datas, repetição, catálogo versionado, migração de progresso antigo | Regras únicas front/back; objetivo atingível com rotina; sem login reward nem bônus pago; nenhum resgate antigo perdido |
| S2.7 Canal de sala e celebração silenciosa | Médio | Alto | Alto | src/chat.js, cooperative.js, migrações, nova view de chat, testes de autorização | Usuário externo, saída da sala, spam, texto HTML, paginação, foco em andamento | Chat explicitamente restrito à sala; feed sem tarefa/projeto; moderação básica/limites; nenhuma interrupção automática do timer |

Branches: `perf/scene-scheduling`, `feat/first-focus`, `feat/weekly-review`, `feat/session-recovery`, `fix/payment-status`, `feat/rotating-quests`, `feat/room-channel`.

Dependências adicionais: S2.4 exige S1.3/S1.4; S2.5 exige S1.4 e testes de webhook preservados; S2.6 exige eliminar duplicidade de missões sem apagar legado; S2.7 exige S0.5/S1.2 e política de acesso explícita. Não implementar passe sazonal ou guildas completas neste recorte: validar interesse e operação primeiro.

## Ordem executável e gates

1. Registrar commit de base e estado do workspace; não sobrescrever alterações locais. Criar fixtures sintéticas, nunca usar `data/` real nos testes.
2. Resolver S0.1 e documentar qualquer falha adicional revelada pelo smoke reparado. Corrigir causas; não enfraquecer asserts. Reexecutar todas as suítes.
3. Entregar S0.2 com teste que falha antes da correção e passa depois. Resgate legítimo continua pagando valores existentes.
4. Concluir S0.3/S0.4; S0.5 antes de expor chat. Browser confirma módulos e navegação.
5. S1.1 preserva chave efetiva; S1.2 preserva schema legado; S1.3 preserva unidade transacional. Um gate de regressão após cada PR.
6. S1.4 mantém API pública do Pay e corrige mistura de identidades. Só depois extrair views ou lazy-load.
7. Medir S1.5/S2.1 antes/depois com mesma massa/dispositivo. Documentar ausência de ganho, se ocorrer; não inventar percentuais.
8. Selecionar o recorte de Sprint 2 pelos problemas observados. Retomada de foco prevalece sobre cosméticos se houver perda de sessão.

Gate comum: `npm test`, `npm run test:features`, `npm run test:payments` e `npm run smoke` verdes; teste novo do risco específico; banco legado inicia duas vezes; diff limitado. Smoke simulado não substitui navegador real para áudio, módulos nativos, PNG e responsividade. Sem credenciais de homologação, pagamentos permanecem verificados por simulação e isso deve ser declarado.

## Critérios de lançamento e rollback

Compatibilidade significa preservar visitante/conta, IDs de catálogo, saldo legítimo, inventário, progressão, formato atual de token durante migração, respostas existentes e regras de crédito. Não significa manter resgate fraudulento. Mudanças de tolerância temporal, divisão de sessão entre dias, empate de ranking e nova economia devem ficar em PRs próprios com decisão registrada.

Antes de migração, gerar backup consistente e testar restauração em diretório isolado. Preferir mudanças aditivas e código anterior capaz de ignorar novas colunas. Se a extração falhar, reverter somente seus commits, mantendo dados. Não apagar schema ou resetar banco para “voltar”. Após qualquer pagamento real novo, restaurar backup antigo requer reconciliação das confirmações; nunca fazer isso automaticamente.

Gatilhos de rollback: saldo duplicado, crédito fora da sessão correta, erro de autenticação após migração, perda de dados legados, falha recorrente em start/sync ou webhook. Desabilitar nova UI opcional é reversível; correção de fraude não deve ser revertida reabrindo emissão ilimitada. Preferir correção adiante ou indisponibilidade temporária apenas do resgate afetado, preservando foco.

## Backlog fora do prazo inicial

Recuperação de conta, exportação/exclusão de dados, migração segura de visitante e revogação de sessão merecem projeto próprio antes de expansão comercial ampla. Passe cosmético e guildas dependem de métricas e suporte. Dimensionamento horizontal depende de dados de carga; não é pré-requisito de lançamento deste recorte.

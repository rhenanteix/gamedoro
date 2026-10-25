# Prompt de execução incremental do gameDoro

Copie o conteúdo da seção seguinte para o agente executor. Ele é autossuficiente; os demais documentos trazem evidências adicionais, mas não substituem a inspeção do código atual.

---

Você é responsável por evoluir o repositório gameDoro incrementalmente. Implemente o lote principal de Sprint 0 abaixo, valide e entregue um relatório com diff e testes. Só avance para os lotes de arquitetura/evolução quando eles fizerem parte do escopo solicitado pelo usuário. Não interprete este plano como autorização de deploy, pagamento real, exclusão de dados ou alteração de credenciais de produção.

## Contexto e invariantes

Aplicação Node >=22.13, Express 4, node:sqlite síncrono/WAL, JavaScript sem framework. Backend em server.js, cooperative.js e src/*.js; frontend em public/app.js, scene.js, shared.js, progression.js, index.html/style.css. Shared e Progression são fontes únicas entre navegador e servidor; preservar UMD e IDs existentes. Renderer Scene usa fillStyle/fillRect e deve continuar compatível com tools/render.js.

Visitante guarda progresso em localStorage `gamedoro:guest:v2`, com até 50 sessões detalhadas; conta usa Bearer e SQLite. Não importar minutos locais para ranking nem apagar visitante ao criar conta. Manter PT-BR, temas e funcionamento mobile.

Regras que não podem mudar incidentalmente:

- 50 gemas iniciais; 1 gema/2 min, 4 XP/min, 0,2 km/min; +5 gemas por conclusão; nível a cada 400 XP. Skills têm até 3 níveis e bônus incrementais arredondados por sessão.
- Start planned 1–120, ou free=true/planned=0. Sync recebe total cumulativo, final pause/stop/complete; credita apenas diferença contra active.credited. Modo livre nunca recebe bônus de conclusão.
- Teto atual do relógio: floor((agora-started_at)/60000)+1. Não alterar tolerância nesta extração. FAST só deve funcionar no ambiente de teste explícito após atualização dos testes.
- Sync é uma única transação de sessions, active, users, progression, room_focus e challenge_focus. Não inserir await no meio. Não criar transações aninhadas.
- Sala é a capturada no início da sessão; boss 600 min/semana, segunda UTC. Não redirecionar créditos ao mudar de sala.
- Desafios reservam 1–500 gemas; aceite inicia sete dias; só sessões iniciadas após aceite; empate/recusa/expiração devolvem reservas exatamente uma vez.
- Freeze custa 25, protege ontem após dia anterior com >=10 minutos, não inventa minutos ou dias de foco. Baú exige 120 min/semana e paga 20–60 uma vez. Missão diária de 30 minutos paga 5, não 10.
- Modo estrito perde três corações por saída de aba e pausa preservando foco; não é bloqueador de aplicativos. Mixer continua tocando até zerar volumes.
- AbacatePay usa API v1 billing/create, PIX, snapshots de valor/gemas/ambiente. Webhook exige secret e assinatura do corpo original, valor/ambiente corretos e transição pending→paid atômica com saldo. Retorno de checkout nunca concede gemas. Não substituir pelo contrato v2 nem imprimir segredos.

## Preparação obrigatória

1. Leia instruções locais aplicáveis, `git status`, README, package.json, server.js, cooperative.js, todos src, shared/progression, app, index/style, scene e suítes. Não suponha que o estado ainda é o da análise.
2. Não sobrescreva trabalho existente. Registre ponto de partida; use branch específica quando autorizado pelas ferramentas do ambiente. Não faça reset destrutivo, commit ou deploy automaticamente fora do escopo.
3. Use bancos temporários e SECRET exclusivo de teste. Não leia/imprima `.env` ou `.secret` reais. O auth atual pode ignorar DATA_DIR e acessar data/.secret: defina SECRET de teste antes de importar server.
4. Execute `npm test`, `npm run test:features`, `npm run test:payments` e `npm run smoke`, registrando resultados. Se o sandbox bloquear portas, solicite a elevação apropriada e explique a limitação; não marque teste bloqueado como aprovado.
5. Baseline conhecida em 24/10/2026: API/payments passam; features espera before+10 onde catálogo/README definem +5; smoke não executa app ES module no JSDOM e falha em saldo vazio. Verifique novamente e não confunda falha preexistente com regressão sua.

## Lote principal — Sprint 0

### A. Recuperar confiança nos testes

Corrija a expectativa de test-features para a recompensa documentada de 5, sem mudar catálogo para acomodar teste. Preserve uma asserção explícita da regra econômica e teste repetição. Corrija tools/smoke para iniciar app e dependências no JSDOM, usando a estratégia de Pay importado e app avaliado já existente em test-payments. Garanta que o teste realmente clica e verifica estado. Valide imports nativos em navegador real quando disponível. Readiness deve falhar claramente se subprocesso morrer; fechar janela/servidor/DB antes de remover pasta temporária. Corrija novas falhas reais expostas pelo harness, sem remover asserts.

Aceite: as quatro suítes terminam; quando alguma falhar, há causa e correção específica, não timeout mascarado.

### B. Fechar resgate ilimitado da API SQL de missões

src/missions.js atualmente faz UPDATE completed=1 e concede recompensa toda vez, sem validar objetivo. Escreva regressão de duas requisições: somente uma pode pagar. Cubra missão sem foco, inexistente, de outro usuário, de dia antigo e já concluída.

Preserve rotas e registros. Adicione objetivo estruturado de forma aditiva se necessário. Para novas missões, planned positivo informa objetivo; modo livre não deve gerar “0 minutos” resgatável: use meta diária de 30 minutos para novas missões desse modo e documente a correção. Para registros legados, converta somente descrição exata `Concluir N minutos de foco`; não invente requisito para descrição desconhecida. Estado antigo completed permanece completo, sem repagar.

Dentro da mesma tx: buscar missão por ID/usuário/dia, verificar minutos efetivamente creditados, atualizar apenas completed=0 e conferir changes antes do crédito de reward_gems/reward_xp. Primeiro resgate legítimo preserva valores gravados; repetição retorna conflito e não paga. Não criar nova recompensa paralela à P para objetivos novos equivalentes. Dados legados desconhecidos devem falhar com erro compreensível e sem concessão arbitrária.

### C. Corrigir inicialização de recursos

index.html carrega chat.js inexistente; mission.js faz fetch sem Bearer mesmo escondido, e renderCoop substitui sua árvore DOM. Remova a inicialização legada quebrada do HTML, preservando Aventura (P) e Grupo (salas/desafios), sem remover APIs/tabelas nesta correção. Não implemente chat global disfarçado de privado. Confira console/network no navegador, como visitante e conta.

### D. Acesso mobile e documentação

style.css oculta btn-cfg <=640px; mantenha Ajustes acessível em 320/375/640 px com teclado/zoom. Atualize README: default 3005, pagamentos existentes, jsdom já em devDependencies. Complete .env.example com nomes de configuração e exemplos não secretos de PORT/DATA_DIR/NODE_ENV/SECRET, deixando claro que SECRET real não entra em versionamento. Não alterar integração financeira.

Após A–D, rode regressões completas e revise diff. Entregue esse lote antes de qualquer refactor amplo.

## Lote de arquitetura — quando solicitado

1. Rate-limit: buckets por finalidade, configuração de proxy compatível com hospedagem; limitar chat após trim e tamanho de 500 caracteres. Testar isolamento entre amigos/login e mensagens vazias. Não alegar privacidade de sala ainda.
2. Config/auth: uma resolução de env/segredo e fábrica de auth. Atenção: hoje server usa DATA_DIR/.secret, mas auth efetivo usa data/.secret do projeto. Preservar chave efetiva e tokens antigos; não sobrescrever segredo divergente automaticamente. Se procedência for ambígua, manter resolução legada temporária e documentar migração administrativa. Token próprio não é JWT; manter formato, validar bytes/alphabet e testar Unicode→401.
3. FAST: exigir NODE_ENV=test e valor exato 1; adaptar subprocessos. Produção rejeita bypass. Testes de anti-trapaça devem rodar também sem FAST usando relógio injetado ou timestamp controlado em banco temporário.
4. DB: transformar src/db.js em fábrica; uma conexão; migrações numeradas com inspeção de schemas antigos/parciais e registro após sucesso. Testar aplicação duas vezes, contagens e saldos, integrity_check e foreign_key_check. Nenhum DROP/reset para “resolver” legado.
5. Sessões: extrair route→service→repositories, preservando contratos e transação única. Injetar relógio. Testar rollback após falha intermediária. Não corrigir meia-noite, tolerância ou desempate de ranking silenciosamente na extração.
6. Frontend: extrair api existente mantendo contrato usado por Pay; Store mantém adaptadores guest/account. Erros aditivos com code e error; 401 claro; falha de rede não mistura visitante e token. Geração de identidade descarta respostas após logout. Retry limitado a leituras seguras; nenhum POST financeiro ou de foco automático.
7. Queries/logs: eliminar N+1 de friends e scores, medir planos e payload; índices somente com evidência. Manter campos/semântica history durante migração do cliente. Logs com rota normalizada, status, duração e código, sem token/email/tarefa/chat/query secret.

## Lote de evolução — quando solicitado

Selecione um recorte por vez. Primeiro limitar frames visíveis a 30 fps, pausar render oculto e respeitar reduced-motion sem afetar timer; depois onboarding opcional e modo compacto. Evoluir diário existente com filtros e amostras explícitas. Recuperação de sessão é entrega própria: identificador/revisão aditivos, consulta de active, retomada pausada, confirmação consultável após resposta perdida, clientes antigos compatíveis. Não creditar tempo offline automaticamente.

Status de compra deve persistir após 90 s com consulta manual; não repetir cobrança ao desconhecer resultado. Reconciliação de creating/failed depende de dados comprovados do provedor e deve ser projetada separadamente, nunca “creditar por tentativa”. Chat de sala só depois de autorização no backend, índices, limites e moderação básica. Novas missões/conquistas usam fontes compartilhadas e recompensas cosméticas; não vender minutos nem multiplicadores competitivos novos.

## Matriz mínima de validação

| Área | Casos obrigatórios |
|---|---|
| Regras puras | G.gemsFor/xp/km/level, limites cfg, P.claim repetido, chest uma vez, freeze sem fabricar dias, níveis de skill e arredondamentos |
| Sessões | pause repetida, stop/complete repetidos, min menor que credited, free sem bônus, teto real sem FAST, sala original, falha intermediária reverte tudo |
| Social | limite 6, não amigo, reserva insuficiente, aceite duplicado, empate, recusa/expiração, liquidação repetida |
| Pagamentos | proprietário, secret/assinatura inválidos, corpo original com espaços, valor/ambiente divergentes, evento duplicado, falha do provedor |
| Persistência | DB vazio/legado/parcial, inicialização repetida, token após reinício, segredo customizado, storage indisponível |
| UI | visitante/conta, login/logout com polling pendente, reload, strict três corações, mobile Ajustes, keyboard, módulos nativos, áudio/PNG real |

Não confunda JSDOM com navegador completo. Registre o que foi simulado e o que ficou sem validação. Não crie testes que apenas reproduzam código: valide invariantes observáveis e transições negativas. Não altere expected arbitrariamente para obter verde.

## Rollback e entrega

Cada fatia deve ser revisável e reversível por código. Antes de migração operacional, backup SQLite consistente e restauração ensaiada fora de produção; não copiar só .db durante escritas em WAL. Preferir schema aditivo, manter fachadas e permitir que código anterior ignore campos novos.

Se houver regressão de crédito, saldo, auth ou webhook, interrompa expansão do lote e corrija ou reverta apenas a alteração responsável. Não reverta correção de fraude reabrindo recompensa ilimitada. Nunca restaurar backup financeiro antigo sem interromper escritas e reconciliar confirmações posteriores. Nenhuma operação destrutiva no banco real é parte deste prompt.

Ao finalizar, informe: objetivo atendido; arquivos alterados; mudanças de comportamento deliberadas; comandos e resultados reais; migrações e rollback; limitações de ambiente e riscos restantes. Não diga “todos passaram” se qualquer suíte ficou bloqueada ou se somente o primeiro erro foi corrigido sem reexecutar. Não publique nem faça cobranças reais.

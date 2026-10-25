# Arquitetura proposta para o gameDoro

Proposta incremental derivada do [diagnóstico](DIAGNOSTICO_GAMEPORO.md). Não representa implementação já realizada. Manter Express 4, JavaScript, SQLite, módulos ES no frontend e UMD nas regras compartilhadas. Nenhum framework, ORM ou serviço externo novo é necessário para os primeiros horizontes.

## 1. Fronteiras e estrutura alvo

```text
server.js                       # carrega configuração, monta app e escuta
src/
  app.js                        # createApp(dependências), sem listen ao importar
  config/index.js               # env validado, caminhos e política de teste
  db.js                         # fábrica openDatabase(config), única conexão
  db/migrations/                # migrações numeradas e registro de versão
  middlewares/auth.js           # identidade e data de referência
  middlewares/errors.js         # erros de domínio e infraestrutura
  middlewares/rate-limit.js     # buckets por finalidade
  routes/sessions.js            # validação HTTP e serialização
  routes/progression.js
  services/session-service.js   # transação de crédito inteira
  services/progression-service.js
  repositories/sessions.js      # SQL preparado, sem conhecer req/res
  repositories/users.js
  utils/auth.js                 # fábrica recebendo secret, sem I/O ao importar
  missions.js / chat.js / achievements.js / payments.js
                                # permanecem até sua extração justificar-se
cooperative.js                  # fachada temporária compatível
public/
  app.js                        # composição e boot
  shared.js / progression.js    # fontes únicas cliente/servidor
  scene.js                      # render puro com fillRect
  payments.js                   # cliente de pagamentos existente
  core/api.js                   # fetch autenticado, erros, cancelamento
  core/store.js                 # estado observado, comandos explícitos
  stores/guest.js / account.js  # adaptadores do Store existente
  timer/controller.js          # transições independentes do DOM
  ui/router.js / feedback.js    # navegação, foco, toast
  views/diario.js / loja.js / cooperativo.js
  audio/mixer.js                # ciclo de vida dos nós
```

Estrutura é destino, não checklist de arquivos vazios. Começar por config/auth, depois uma fatia de sessões. Route handlers pequenos podem exercer função de controller; criar `controllers/` apenas se houver lógica HTTP reutilizada. Não criar um repositório genérico com dezenas de métodos abstratos.

```text
HTTP → autenticar → validar → serviço → tx síncrona → repositórios → SQLite
                                  ↘ Shared / Progression
DOM → comando do timer/Store → adaptador conta → cliente HTTP
                           ↘ adaptador visitante → localStorage
Estado confirmado → subscribers → views / renderer / áudio
```

## 2. Configuração e autenticação sem invalidar contas

Config é resolvida uma vez: `.env` opcional, ambiente existente prioritário, PORT default 3005, DATA_DIR persistente, NODE_ENV, SECRET e configuração AbacatePay. Validar porta inteira, caminho gravável e booleans explícitos. Pagamentos ausentes deixam apenas a compra indisponível; nunca impedir timer/visitante por ausência de credenciais PIX. Não registrar valores de env.

Migração de segredo exige cuidado: hoje auth usa `data/.secret` do projeto quando SECRET não está definido, mesmo se o servidor criou outro em DATA_DIR. Mudar diretamente para DATA_DIR invalida tokens existentes. Sequência segura:

1. Identificar por caminho/configuração qual chave o processo antigo efetivamente usava, sem imprimir seu conteúdo.
2. Preferir manter essa mesma chave via configuração protegida. Em instalação única, pode-se copiar a chave efetiva para o destino com modo 0600, sem sobrescrever segredo divergente automaticamente.
3. Se há duas chaves distintas e origem ambígua, não adivinhar: manter temporariamente a resolução legada com aviso de caminho anonimizado e um procedimento administrativo de migração. Não aceitar chaves de outra instalação.
4. Testar token emitido antes do reinício depois da migração, e isolamento entre instalações novas.

Usar `createAuth({secret, now})`; manter o formato atual de token e prazo de 30 dias. Validar exatamente dois segmentos e base64url; comparar buffers do mesmo tamanho. Uma futura revogação por versão de sessão é outra mudança de contrato. Migrar scrypt para assíncrono só com limite de concorrência e teste de carga; manter hash compatível.

`GAMEDORO_FAST` deve valer apenas se `NODE_ENV=test` e valor exato `1`. Atualizar os subprocessos das suítes junto. Em produção, recusar inicialização com bypass habilitado, com erro sem segredos. Não alterar tolerância de um minuto nesta mesma mudança.

## 3. Serviços, validação e erros

A primeira extração de sessões deve copiar regras existentes sem “melhorias” semânticas. Repositórios recebem db; serviço recebe repos, tx, relógio e regras. Nenhum await dentro de uma transação SQLite síncrona. Chamada de rede de pagamentos permanece fora da transação; apenas a confirmação e saldo entram juntos.

Exemplo de fronteira, ilustrativo:

```js
function createSyncHandler({ parseSync, sessionService, stateOf }) {
  return (req, res, next) => {
    try {
      const input = parseSync(req.body);
      sessionService.sync({ uid: req.uid, day: req.today, ...input });
      res.json(stateOf(req.uid, req.today));
    } catch (error) { next(error); }
  };
}
```

Validadores manuais pequenos são suficientes. Preservar conversões já utilizadas: inputs HTML de desafios chegam como strings numéricas via FormData. Não tornar tudo estrito sem testes de compatibilidade. Validar safe integers, enums, limites de texto após trim e coerência free/planned. `G.isDay` merece round-trip de data para rejeitar dias normalizados inválidos; essa mudança exige casos de calendário explícitos.

Evolução aditiva do erro, mantendo campo `error` e status existentes:

```json
{"error":"Tempo insuficiente para creditar esses minutos.","code":"SESSION_TIME_INSUFFICIENT"}
```

Tabela alvo: 400 validação (`VALIDATION_ERROR`), 401 autenticação (`AUTH_EXPIRED`), 403 posse (`ITEM_NOT_OWNED`), 404 recurso, 409 conflito (`MISSION_ALREADY_CLAIMED`), 422 tempo, 429 limite, 502 provedor, 503 indisponibilidade. Não remapear todos os status numa extração. Erros desconhecidos retornam 500 sem mensagem SQL; `POST /progression` hoje devolve qualquer `e.message` como 409, devendo distinguir domínio de falha interna. Tratar JSON inválido e corpo grande separadamente.

### Resgate legado: correção prioritária

Manter `/missions` e `/missions/complete` enquanto houver compatibilidade necessária. Acrescentar objetivo estruturado a novas missões, derivado do planned do start, e não confiar no botão do cliente. Para a missão textual histórica no formato exato `Concluir N minutos de foco`, backfill pode usar esse N; linhas não reconhecidas não recebem objetivo inventado, ficam indisponíveis para crédito até classificação. Modo livre não deve criar objetivo zero automaticamente resgatável: associar a meta diária existente de 30 minutos para novos registros, explicitando a correção no contrato.

Dentro da mesma transação: buscar missão por usuário/ID/dia, verificar objetivo com sessões creditadas, fazer UPDATE `WHERE completed=0`, testar `changes===1`, conceder recompensa gravada. Repetição pode retornar 409, sem novo crédito; missão de outro usuário retorna 404. Preservar completed e valores históricos. Não apagar tabela nem “migrar” todas as missões para P.claimed sem correspondência verificável. Novas funcionalidades devem usar P; a ponte legada não deve criar dupla recompensa para o mesmo novo objetivo.

## 4. Transações e contratos que não podem se fragmentar

| Operação | Unidade atômica necessária |
|---|---|
| Cadastro | users + owned |
| Início | substituição active + sessions + criação de missão |
| Sync | sessions + active + users + progression + room_focus + challenge_focus |
| Compra de item | verificar saldo/posse + debitar + owned |
| Resgate/skill/freeze/baú | validar estado + salvar progression + saldo |
| Convite/aceite/liquidação | desafio + reservas/devoluções + winner/status |
| Webhook | transição pending→paid + gems |
| Missão SQL | requisito + completed condicionado + recompensa |
| Amizade | ambas as direções |
| Entrada em sala | existência, ausência de outra associação e contagem <6 + inserção |

Entrada em sala hoje é sequência síncrona em um processo, mas limite não tem garantia transacional entre múltiplas conexões. Tornar atômico antes de considerar múltiplos workers. Não aninhar `tx()` quando um serviço chama outro: definir método interno que participa da transação do chamador.

### Contratos de sessão a congelar em testes

```json
{"planned":25,"free":false,"task":"Revisar capítulo","project":"Estudo","day":"2026-10-24"}
```

Start atual retorna `{ok:true}`. Sync recebe `{"minutes":10,"final":"pause","day":"2026-10-24"}`; minutes é cumulativo, não delta. Response preserva user/state; free=true exige planned=0 e rejeita complete. Pausar novamente no mesmo minuto não rende saldo, XP, boss ou desafio extras. Concluir exclui active, impedindo segundo bônus.

Após estabilizar essa base, adicionar sessionId e revisão opcional de modo compatível. Clientes novos usam identidade para rejeitar sync atrasado de uma sessão anterior; clientes antigos continuam aceitos durante a janela de migração. Uma resposta perdida de complete precisa poder ser consultada sem repetir recompensa. Antes disso, proibir retries automáticos de mutações.

Pagamentos mantêm v1, `/billing/create`, `ONE_TIME`, PIX, snapshot monetário e ambas as formas atuais de `data.billing`/`data`. Preservar captura do rawBody antes de qualquer transformação. Novas rotas estáticas devem preceder `/:reference`. A configuração de query secret exige sanitizar URLs em logs de app e proxy.

## 5. Banco e migrações graduais

Converter `src/db.js` em fábrica sem side effect; server passa a usá-la uma única vez. Introduzir `schema_migrations(version PRIMARY KEY, applied_at)` e registrar versões somente após sucesso de cada migração. A versão inicial deve reconhecer schema parcial pelo PRAGMA, porque instalações podem conter só parte das adições. Não supor que ausência de versão significa banco vazio.

Primeiras migrações são aditivas: metadados estruturados de missão, índices comprovados e tabela de versões. FKs faltantes exigem reconstrução de tabela; adiar até existir inventário de órfãos, plano de correção e teste com cópia de banco. `PRAGMA foreign_key_check` e `integrity_check` entram na validação, sem excluir dados automaticamente. `created_at` de pagamentos usa segundos; outros timestamps usam milissegundos: documentar unidades antes de unificar.

Trocar N+1 de amigos por LEFT JOIN com agregação limitada ao intervalo, mantendo amigos com zero. Buscar challenge_focus em lote para os desafios exibidos. Não mudar desempates do ranking sem decisão explícita: hoje top usa uid para desempate, mas posição própria conta só quem tem mais minutos.

Para `/history`, manter os campos atuais até cliente migrar; adicionar consulta agregada/intervalo como opção. Não truncar silenciosamente hours, pois afeta insights. Incluir intervalo e tamanho da amostra na UI. Só considerar Postgres quando medidas mostrarem contenção de escrita persistente ou necessidade real de múltiplas instâncias independentes. Não compartilhar arquivo SQLite entre hosts como solução de escala.

## 6. Frontend incremental

Extrair `api()` existente para `createApi({getToken,onUnauthorized,fetchImpl})`, mantendo interface usada por Pay. Suportar AbortSignal, timeout de leitura e erro com status/code. Retry com backoff limitado apenas para GET sem efeito financeiro novo; `/coop` continua podendo liquidar, embora de forma idempotente. Nunca repetir automaticamente createCheckout, start, sync ou apostas. Em 401, preservar contexto e apresentar reautenticação; em falha de rede, não substituir conta por visitante mantendo token.

O Store existente vira fachada com adaptadores guest/account e estado explícito `{identity,status,profile,game}`. Timer mantém domínio próprio com transições idle/running/paused/syncing; não guardar handles DOM no estado. A identidade tem geração monotônica: respostas antigas de polling/history são descartadas depois de logout/login. Subscribe retorna unsubscribe; eventos de confirmação de estado atualizam views, sem bus genérico para qualquer coisa.

Extrair primeiro loja ou diário, com `mount(container,deps)` e `dispose()`. Reutilizar helpers de escape, cards e feedback. Preferir textContent para conteúdo do usuário. Carregar views pesadas por import sob demanda apenas depois de assegurar testes de módulos e erros de carregamento. Shared/P permanecem carregados antes do boot; não criar cópia de seus catálogos.

Recuperação de foco merece entrega separada: endpoint aditivo de active com identidade, plano e créditos confirmados; reload inicia em estado pausado e oferece encerrar/retomar, sem creditar automaticamente tempo offline. Persistir snapshot visitante com timestamp e versão, mas não confiar nele no servidor. Login/logout com fase ativa deve sincronizar ou manter estado recuperável antes da troca; não apagar saldo local em falha.

## 7. Performance, áudio e acessibilidade

Medir em dispositivo de referência: duração p95 de frame, frames em 10 s, requisições por minuto, tamanho de history e p95 HTTP. Alvo inicial de experimento: limitar cena a 30 fps visível, zero novos frames com documento oculto, cena estática sob reduced-motion, sem alterar tempo focado. `public/landing.js` já demonstra visibilidade e preferência de movimento: aproveitar o padrão. Timer continua baseado em relógio, independente de frames.

Atualizar relógio DOM só quando segundo/texto mudar. Conservar os caches de Scene e `fillRect`; otimizar lookup de DOM antes de inventar canvas offscreen. Preview testa quatro mundos, todas as skins e estados climáticos; PNG usa contexto real com drawImage/texto, distinto do renderer básico.

Mixer deve manter semântica de tocar nas pausas; extrair stop/disconnect/dispose para fechamento, troca de instância e falha. Mostrar “Silenciar todos” é opt-in e não implica parar sons ao pausar. Testar AudioContext real, incluindo resume após gesto.

Manter Ajustes acessível em 320/375/640 px; aria-current no link ativo; foco no título da view por navegação do usuário; nome acessível do progresso; tabela textual do diário; anúncios só em início, pausa, conclusão e erro. Diálogos conservam foco/restauração nativos. Dark/light existente permanece baseado no sistema, com possível preferência manual depois.

## 8. Observabilidade, qualidade e operação

Logs estruturados: requestId aleatório, rota normalizada, método, status, duração, code. Nunca token, senha, email, texto da tarefa, corpo do chat, query do webhook ou corpo bruto de pagamento. Métricas úteis: sync rejeitado por motivo, tempo de resposta, espera de banco, checkout pending por idade, webhook duplicado/negado e erro de storage local. Falha de provedor não deve incluir payload sensível.

Scripts propostos: `test:unit` com node:test para G/P, `test:all` sequencial com as suítes existentes, `test:browser` para módulos reais quando houver harness disponível. Corrigir smoke aproveitando injeção explícita de Pay do teste de pagamentos; confirmar também em navegador real, porque esse contorno não valida imports nativos. Testes devem definir SECRET temporário e DATA_DIR isolado; readiness precisa falhar imediatamente quando subprocesso morre.

Matriz obrigatória: token malformado Unicode; DATA_DIR e reinício; missão duplicada/sem foco/outro usuário; crédito cumulativo fracionado; pausa longa e limite de relógio sem FAST; free; freeze; baú; skill durante sessão; coop sala original; sete membros; aposta/empate/expiração; webhook repetido, valor e ambiente; banco legado aplicado duas vezes; visitante recarregado; rede falhando e logout com polling pendente.

Backup: usar mecanismo de backup consistente do SQLite, ou parar escritas e encerrar conexões antes de copiar banco com estado WAL consistente. Nunca copiar só o arquivo principal enquanto há escrita. Testar restauração fora de produção. Reverter código mantendo colunas aditivas é preferível a down migration destrutiva. Para rollback que exigiria restaurar banco, primeiro interromper escritas e reconciliar pagamentos posteriores ao backup; uma restauração cega perde confirmações financeiras.

## 9. Ordem de migração

Baseline/testes → falhas de integridade → config/auth → migrações/DB → extração transacional de sessões → API/store → consultas/logs → recuperação de foco → features. Cada etapa tem contrato e teste próprio no [roadmap](ROADMAP_PRIORIZADO.md). Novas abstrações só substituem o caminho antigo depois de paridade demonstrada; manter fachadas durante a transição.

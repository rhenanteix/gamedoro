# Configuração de pagamento em produção — 25/10/2026

## Configuração aplicada

Projeto Vercel confirmado pelo domínio `gamedoro.vercel.app`, projeto `gamedoro`, conta `rhenanteixs-projects`.

| Variável | Destino | Tipo | Estado |
|---|---|---|---|
| ABACATEPAY_API_KEY | Production | Secret/sensitive | Salva; valor omitido |
| ABACATEPAY_WEBHOOK_SECRET | Production | Secret/sensitive | Salva; valor omitido |
| APP_URL | Production | Config/plain | `https://gamedoro.vercel.app` |
| ABACATEPAY_DEV_MODE | Production | Config/plain | `false` |

As credenciais não foram gravadas nos arquivos do projeto. Os arquivos temporários usados na consulta ao provedor foram removidos. Preview e Development não receberam credenciais de produção. O código e os bancos locais não foram alterados por esta configuração.

Não foi feito redeploy: as variáveis ficam disponíveis para o próximo deployment. O endpoint público atual `/api/health` respondeu 200; `/api/payments/webhook`, consultado com corpo vazio e sem segredo, respondeu 503, consistente com a configuração ainda ausente no deployment ativo.

## Bloqueios confirmados

1. **Versão da chave:** uma consulta somente de leitura à API v1 retornou 401 com `API key version mismatch`. A mesma chave consultou a API v2 com HTTP 200. O app atual cria cobranças v1 e processa `billing.paid`, portanto essa chave exige migração da integração para v2.
2. **Webhook cadastrado:** a API v2 confirmou o webhook `joguinho` em produção, com endpoint `https://gamedoro.vercel.app/` e `events: []`. Assim ele não está configurado para notificar a confirmação no endpoint da aplicação. O destino esperado é `https://gamedoro.vercel.app/api/payments/webhook`; o evento de checkout v2 é `checkout.completed`, que precisa primeiro ser implementado e testado no servidor.
3. **Persistência:** o backend usa `node:sqlite` e arquivo local. A Vercel não oferece armazenamento local compartilhado e persistente entre funções. Saldo, compra e idempotência precisam de banco persistente antes de ativar recebimentos reais. A presença de `/api/health` não comprova durabilidade de dados.

O webhook existente não foi removido nem substituído por uma configuração incompatível com o código ativo. Nenhuma cobrança, pagamento ou reembolso foi criado nas verificações.

## Decisão pendente e sequência

Escolher entre manter Vercel com banco remoto persistente ou manter SQLite e hospedar o backend em servidor com disco persistente. Essa decisão define infraestrutura, migração e eventuais custos; não deve ser tomada apenas pela configuração da chave.

Depois da decisão:

1. Preparar armazenamento persistente e migração de usuários, sessões, progressão e pagamentos, sem exportar dados para arquivos públicos.
2. Implementar checkout AbacatePay v2 com catálogo de produtos do provedor e snapshot de preço/gemas/ambiente; manter tratamento seguro de eventuais compras v1 anteriores.
3. Adaptar webhook para payload v2, mantendo verificação do secret, assinatura sobre corpo original, valor/ambiente, propriedade e crédito único em transação.
4. Testar checkout, eventos simultâneos/repetidos, retorno da compra, falhas e recuperação em ambiente isolado.
5. Corrigir o webhook para endpoint e eventos compatíveis com a versão publicada; validar recebimento público sem expor segredo.
6. Publicar com variáveis de produção já configuradas e homologar antes de liberar vendas.

Não apontar `DATA_DIR` para `/tmp` como solução de persistência financeira; isso apenas torna o armazenamento temporariamente gravável. O banco e `.secret` já rastreados em `data/` também precisam de tratamento próprio, sem apagar dados legítimos nem invalidar tokens sem planejamento.

Referências: [AbacatePay — autenticação](https://docs.abacatepay.com/pages/authentication), [checkout v2](https://docs.abacatepay.com/pages/payment/create), [webhooks v2](https://docs.abacatepay.com/pages/webhooks/reference), [Vercel — SQLite e persistência](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

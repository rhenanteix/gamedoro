# Validação de carregamento e pagamento — 25/10/2026

## Personagem

Fluxo examinado: HTML/fontes → scripts → Store.load → perfil → criação do canvas → primeiro desenho.

Dois bloqueios encontrados em `public/index.html` e `public/app.js`: stylesheet externo de fontes na cadeia crítica dos scripts e criação da cena somente depois de `/api/me`. A renderização inicial também esperava o término da navegação assíncrona.

Correção: fontes carregam com mídia não bloqueante e são aplicadas após seu evento load; o primeiro desenho ocorre antes da consulta de perfil. Visitante usa sua aparência local; conta começa com uma prévia padrão, substituída pela aparência confirmada. Nenhum saldo ou progresso de conta é inferido para essa prévia. A animação normal continua depois da inicialização do estado.

Experimento em Chrome headless, perfil e banco temporários, com fonte atrasada artificialmente em 2 segundos e consulta de perfil em 1,5 segundo:

| Medida | Antes | Depois |
|---|---|---|
| Primeiro desenho no canvas principal | 3.685 ms | 197 ms |
| Fim do atraso artificial do perfil | 3.613 ms | 1.701 ms |

São medições locais de uma execução por versão sob condições controladas, não métricas de produção ou garantia de tempo em qualquer dispositivo. O teste registra a primeira chamada de desenho no canvas; não mede Core Web Vitals. A camada que esperava a fonte deixou de impedir o início da consulta de perfil e da cena.

`test-loading.js`, agora incluído em `npm run smoke`, segura a resposta de perfil e comprova desenho anterior à resposta, ausência de saldo inventado, aplicação posterior de fontes e atualização com saldo/mundo confirmados.

## Pagamento PIX

Fluxo examinado: Loja → cliente autenticado → criação de cobrança v1 → registro pending → checkout → webhook autenticado → transação de saldo → consulta do retorno → atualização da loja.

O contrato de criação usa `ONE_TIME`, `PIX`, produtos com preço em centavos e URLs de retorno/conclusão, conforme a [referência oficial de cobrança v1](https://abacatepay.readme.io/reference/postbillingcreate). O evento `billing.paid`, seus campos de valor/status/ambiente e o tratamento de falhas temporárias foram confrontados com os [webhooks v1](https://docs.abacatepay.com/pages/v1/webhooks). A verificação do secret e da assinatura sobre o corpo original segue a [documentação de segurança de webhooks](https://docs.abacatepay.com/pages/webhooks).

| Fronteira | Resultado e evidência |
|---|---|
| Cliente → API | Autenticação exigida; pacote inexistente rejeitado; payload de criação conferido |
| API → provedor | Simulação do contrato v1; erro do provedor, valor/ambiente divergente e checkout sem HTTPS rejeitados |
| Webhook → banco | Assinatura ausente/inválida ou de bytes diferentes rejeitada; secret, valor, ambiente e status conferidos |
| Idempotência | Duas entregas simultâneas e repetição do evento mantêm crédito único |
| Privacidade | Outra conta não consulta a compra |
| Retorno → interface | Consulta de compra paga atualiza saldo e remove parâmetro da URL, sem novo crédito |
| Sem configuração | Catálogo retorna available=false e tentativa de compra retorna 503 |

Validações executadas: `npm run test:payments` e `npm run smoke`, ambas passaram. As mensagens de falha do provedor durante a suíte são cenários negativos intencionais.

## Limite da validação real

No ambiente local examinado, `ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET`, `APP_URL` e `ABACATEPAY_DEV_MODE` estavam ausentes/vazios. A inspeção reportou apenas presença e validade, sem imprimir segredos. Portanto, a integração está validada por simulação, mas o pagamento real não está habilitado neste ambiente.

Para homologação externa, preencher as variáveis conforme o README, usar chave v1 e webhook no mesmo ambiente, configurar URL HTTPS pública e confirmar a entrega de `billing.paid` com secret e assinatura. Não foram criadas cobranças reais, alteradas credenciais ou feitas operações no painel. A entrega do webhook através da infraestrutura pública ainda precisa dessa homologação. Estados ambíguos após falha de rede na criação e reconciliação financeira continuam como evolução separada no roadmap.

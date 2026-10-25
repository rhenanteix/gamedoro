# Ideias e melhorias de produto

As estimativas abaixo são hipóteses qualitativas, não resultados medidos. Objetivo: aumentar dias de foco sustentável e confiança no registro, sem premiar permanência improdutiva no app. Dependências técnicas e execução estão no [roadmap](ROADMAP_PRIORIZADO.md).

## 1. Critério de prioridade

Primeiro corrigir integridade das recompensas, testes e sessão. Depois reduzir fricção no primeiro foco, na retomada e no celular. Só então ampliar interação social e monetização. Não introduzir streak de login separado: recompensar abrir a página incentiva atividade sem foco. Não adicionar missões que exijam madrugada, jornadas longas ou pagamento para recuperar posição.

| Ideia | Impacto esperado | Esforço | Risco | Momento |
|---|---|---|---|---|
| I01 Primeiro foco guiado e opcional | Alto: ativação | Baixo | Baixo | Sprint 2 |
| I02 Retomada confiável e vínculo de conta claro | Alto: confiança/retenção | Alto | Alto | Sprint 2, entrega própria |
| I03 Modo foco compacto e Ajustes mobile | Alto: uso diário | Baixo | Baixo | Sprint 0 + 2 |
| I04 Revisão semanal por projeto | Médio: retorno com propósito | Médio | Baixo | Sprint 2 |
| I05 Missões rotativas sem penalidade | Médio: variedade | Médio | Médio | Após baseline de retenção |
| I06 Grupo silencioso e celebração coletiva | Médio: retorno social | Médio | Médio | Sprint 2+ |
| I07 Loja transparente e coleção cosmética | Médio: conversão/confiança | Médio | Médio | Copy primeiro; catálogo depois |
| I08 Coleção de conquistas e trilhas visuais | Médio: identidade | Médio | Médio | Posterior |
| I09 Jornada sazonal permanente | Incerto: receita/retorno | Alto | Alto | Experimento posterior |

## 2. Experiências propostas

### I01 — Primeiro foco em uma tela

Problema: a tela inicial já apresenta tarefas, presets, mundos, estrito, áudio, clima e cartão. Há valor, mas muitas escolhas antes do primeiro início.

Mockup descritivo: pequeno card acima dos controles, só na primeira visita, com “Qual é o próximo passo?”; tarefa opcional; 10/25 minutos; botão primário “Começar meu foco”; link “Explorar por conta própria”. Mostrar a cena e o timer desde o início. Após primeiro registro, sugerir diário e só então conta.

Copy: “Uma tarefa. Alguns minutos. Sua jornada começa aqui.” Após conclusão: “Você registrou 10 minutos. Faça uma pausa quando precisar.” Conta: “Sua jornada está neste navegador. Uma conta permite continuar em outros dispositivos; o progresso de visitante ainda não é transferido.” Não prometer migração inexistente.

Implementação: preferência local versionada de onboarding; reusar Store.start e presets. Funciona para visitante e conta sem alterar recompensa. Métrica: proporção de novos visitantes com primeiro foco creditado e tempo até iniciar. Guardrail: abandono do timer e taxa de erro de start não aumentam. Aceite: dispensável, teclado completo, sem exigir email nem criar um segundo timer.

### I02 — Retomar com clareza

Problema: reload/login/logout abandonam o estado visual da fase. O usuário precisa confiar mais nos minutos que no inventário.

Mockup: banner persistente “Há uma fase com 12 minutos já registrados”, com “Retomar foco” e “Encerrar com 12 minutos”. Mostrar separado o que foi confirmado e o que está aguardando sincronização. Em offline, informar situação sem exibir saldo visitante como se fosse conta.

Copy: “Seus 12 minutos estão salvos. O tempo fora do app não será creditado automaticamente.” Erro: “Não conseguimos confirmar este registro. Sua fase continua disponível para tentar novamente.”

Dependência: identidade de sessão, consulta de active, política de retry e snapshot local. Não importar totais de visitante para ranking; eventual migração futura deve separar histórico pessoal não verificado de minutos competitivos verificados. Métrica: sessões recuperadas e reclamações/perdas de registro; guardrail de zero duplicação de saldo. Aceite: recarregar, trocar aba e reconectar sem crédito novo injustificado.

### I03 — Foco compacto, acessível no celular

Mockup: durante fase, manter tarefa, tempo, pausar/encerrar e cena reduzida. Mundo, mixer e opções ficam em disclosure “Personalizar ambiente”. Ajustes continua disponível no topo ou menu em qualquer largura. Preferência “Reduzir movimento” respeita sistema. Nenhuma opção desaparece permanentemente.

Copy: “Seu foco está em andamento”; “Personalizar ambiente”; “Silenciar todos os sons”. Ao modo estrito: “Sair da aba custa um coração. Ao perder os três, o foco pausa e preserva os minutos registrados.”

Métrica: iniciar/pausar no mobile sem erro, acessos a Ajustes e duração de frame. Aceite: 320 px e zoom 200%, navegação por teclado, diálogo acessível, nenhum timer anunciado quatro vezes por segundo. O tema já acompanha o sistema; oferecer seletor manual claro/escuro/sistema somente como pequena extensão.

### I04 — Revisão semanal útil

Já existem minutos por projeto, horário de maior volume e conclusão por duração. Evoluir esse diário, sem vender a mesma funcionalidade como inédita.

Mockup: filtro de período; três cards “Você registrou”, “Projetos”, “O que funcionou”; lista com amostra e uma sugestão opcional de preset baseada em taxas de conclusão. Barras têm tabela textual alternativa. Visitante vê aviso “Detalhes baseados nas últimas 50 fases deste navegador”.

Copy: “Você concluiu 4 de 5 fases de 25 minutos neste período. Quer usar essa duração hoje?”; “Mais minutos registrados às 9h. Isso descreve seu histórico, não mede produtividade.” Amostras pequenas não geram ranking de horários.

Métrica: retorno do diário para início de foco, uso de filtro e taxa de conclusão por preset. Não inferir saúde ou eficiência profissional. Aceite: mínimo de cinco registros para horário e três por duração, intervalos explícitos, sem comparação entre amostras incompatíveis.

### I05 — Missões rotativas com opção de escolha

Mockup: duas opções semanais, escolher uma, ambas atingíveis com foco normal. Exemplos: “Registrar uma tarefa em três fases” ou “Voltar em dois dias da semana”. Só metadados de sessões reais, sem recompensar clicar repetidamente. Oferecer “Trocar missão” antes do progresso e sem custo.

Copy: “Escolha uma missão que caiba na sua semana. Seu ritmo vem primeiro.” Recompensas inicialmente cosméticas ou equivalentes ao orçamento atual, sem elevar metas de minutos.

Implementação: catálogo compartilhado com IDs estáveis/versionados; atribuição determinística; resgate idempotente; datas consistentes entre visitante e conta. Manter missões atuais durante experimento sem duplicar recompensa equivalente. Métrica: retorno em dias distintos e conclusão saudável; guardrail: minutos muito longos por dia e reclamações sobre obrigação. Aceite: sem penalidade por ausência, sem recompensa de login puro e sem tarefas relacionadas a pagamento.

### I06 — Grupo silencioso e celebração

Antes de guildas persistentes, tornar sala atual realmente útil. O chat atual é global, não chat de equipe; não expor isso como canal privado.

Mockup: membros/presença → meta do boss → botão “Estou em pausa” → feed enxuto de marcos coletivos. Durante foco, contador discreto; sem popup ou som. Chat de sala, se incluído, fica recolhido e só busca mensagens da associação autorizada; ações de silenciar/bloquear e denúncia devem preceder abertura ampla.

Copy: “O grupo somou 120 minutos nesta semana. Cada pessoa no seu ritmo.” Para boss: “Meta coletiva alcançada. Descansem e voltem quando fizer sentido.” Não exigir quantidade individual mínima para pertencer.

Dependências: escopo de sala em mensagens, autorização no servidor, retenção e limites; eventos de celebração deduplicados. Não publicar nome de tarefa ou projeto. Métrica: retorno de participantes de sala, silenciamentos e denúncias. Aceite: usuário fora da sala não lê/escreve, mensagens não interrompem foco, feed é limitado. Guildas, cargos e moderação avançada ficam fora do MVP.

### I07 — Loja de confiança e cosméticos diretos

Hoje já existem pacotes PIX autenticados e confirmação por webhook. Melhorar explicação e recuperação antes de mudar integração ou preços.

Mockup: saldo → cosméticos em prévia → pacotes com preço total → estado “Aguardando confirmação” e ação “Verificar novamente”. A mensagem de pendência permanece visível depois do toast. Nenhum contador falso de urgência. Evitar clicar novamente em comprar quando o problema é uma cobrança pendente.

Copy: “Personalize sua jornada. Seu foco continua gratuito.”; “Pagamento em confirmação. As gemas chegam após a confirmação do PIX.”; “Já pagou? Verifique o status desta compra.” Não prometer prazo exato que depende do provedor.

Limite econômico: gemas atuais também compram skills e apostas. Manter direitos existentes, mas não anunciar que toda compra atual é puramente cosmética. Primeiro lançar novos cosméticos sem bônus; possível compra direta de cosmético é um projeto próprio de entitlement e webhook, sem reaproveitar crédito de gemas de forma improvisada.

Métrica: criação→pending→paid, idade de pending, erro por pacote e contato de suporte. Conversão vem da confirmação do servidor, nunca da URL de retorno. Aceite: repetição do webhook não duplica nada; estado de pedido não vaza para outra conta; copy não sugere vantagem em minutos/ranking.

### I08 — Coleção com raridade e trilhas visuais

Mockup: álbum com capítulos, conquistas e contorno visual por raridade; exemplos “Primeiro passo”, “Companhia de viagem”, “Explorador da costa”. Progresso visível e descrição do requisito; nada de loot box paga.

A árvore atual tem apenas dois caminhos de bônus. Expandir primeiro com ramificações visuais sem multiplicadores: pegadas, bandeiras, molduras e variantes de pet. Não aumentar XP/gemas pagos nem alterar três níveis existentes. Raridade é classificação de catálogo, não percentual inventado de usuários.

Copy: “Uma lembrança da sua jornada”; “Desbloqueado ao completar este capítulo”. Métrica: visualização/equipamento e retorno ao foco; guardrail: tempo em menus não cresce à custa de sessões. Aceite: progresso antigo preservado, condições compartilhadas e desbloqueio idempotente.

### I09 — Jornada sazonal sem prazo punitivo

Hipótese posterior: um passe cosmético de capítulos, compra opcional, trilha gratuita completa e conteúdo adquirido que não expira. Evitar obrigação de logar diariamente ou perder compra ao fim da temporada. Eventos podem renovar cenários, não multiplicar recompensas financeiras.

Mockup: trilha com capítulos já existentes, tema visual e prévia de todos os itens; texto explícito de permanência. Copy: “Explore no seu tempo. O conteúdo adquirido continua disponível.”

Esforço alto: entitlement, catálogo versionado, suporte e integração financeira. Só priorizar após evidência de interesse em cosméticos e integridade econômica. Métrica: interesse em prévia e compra confirmada, sem promessa de receita. Aceite: nenhum bônus de minutos, XP competitivo ou stake; evento não altera progressão antiga; nenhum prazo que incentive grind.

## 3. Medição mínima sem capturar conteúdo pessoal

Métrica principal proposta: usuários com foco confirmado em dias distintos por semana. Definir ativação como primeiro registro de pelo menos 1 minuto; acompanhar também quantos chegam a 10 minutos sem transformar isso em meta obrigatória. D1/D7: retorno com foco confirmado no dia correspondente, por coorte de ativação e calendário explicitado. Visitantes e contas são coortes distintas; conversão não pode duplicar identidade automaticamente.

Eventos candidatos: onboarding visualizado/dispensado, start aceito, sync confirmado, erro categorizado, retomada oferecida/aceita, diário aberto, checkout criado e pagamento confirmado. Deduplicar eventos de crédito por sessão/revisão. Não registrar tarefas, projetos, email, mensagem de chat, tokens ou URLs de webhook. Reusar dados agregados existentes de conta antes de instalar SDK externo. Analytics de visitante, se transmitido, exige escolha explícita e explicação de retenção; sem consentimento, fica local.

Estabelecer baseline por duas semanas, registrar número de usuários e evitar conclusões estatísticas com amostra pequena. Comparar coortes similares; anotar releases e feriados. Hipótese segue apenas se melhora a métrica principal sem elevar falhas, sessões excessivas ou suporte. Um teste pequeno pode produzir resultado inconclusivo; isso não é sucesso automático.

## 4. Decisões a adiar

Sem reescrita em framework, ranking por gasto, venda de minutos, gemas por login, push agressivo, battle pass com expiração de compra ou novos multiplicadores pagos. Guildas persistentes e chat público exigem capacidade de operação/moderação. Recuperação de senha e portabilidade de dados são necessidades reais para contas duráveis, mas não cabem escondidas no escopo de um pequeno refactor.

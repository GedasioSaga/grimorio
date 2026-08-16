# HANDOFF — Grimório (16/08/2026)

Retrato para retomar sem contexto. **Código ganha de qualquer afirmação daqui.**

## Estado

- `main` com 10 commits novos nesta sessão. Suíte: **1347 PASS**, `npx tsc --noEmit` limpo, `npm run build` verde.
- Última versão publicada continua a **v0.9.1**. Nada desta sessão foi publicado — os outros computadores ainda rodam código antigo.
- Falha intermitente conhecida (1 em ~4 rodadas da suíte inteira): `usuarioMapa.test.ts` mexe em estado global do tldraw enquanto o vitest roda arquivos em paralelo. Rodar o arquivo sozinho passa.

## O que foi feito nesta sessão

Cinco defeitos relatados pelo usuário e cinco features.

| Área | Antes | Agora |
|---|---|---|
| Teia | posição arrastada vivia só em estado React | grava em `layout-teia.json` como **fração** da moldura (sobrevive a janela de outro tamanho), por escopo (cofre / campanha) |
| Painéis do mapa | `ALTURA_PAINEL_PROPRIEDADES_PX = 184` chutada empurrava camadas para baixo | coluna flex; a constante morreu |
| Card do canvas | ignorava o Enquadrar Retrato; controles em px fixo | aplica `object-position`; controles escalam por `--card-fe` **e** por `escalaDosControles(cardFe, zoom)` |
| Conflito de sync | multiplicava `(conflito) X` sem parar; mapa/canvas sem como resolver | preservação idempotente; painel Nuvem lista os 4 tipos com Abrir/Descartar |
| Busca | só a árvore da sidebar | Ctrl+K acha qualquer coisa, respeitando o filtro de campanha |
| Lixeira | exclusão definitiva | `.lixeira/<id>/` dentro do cofre, com restaurar |
| Sala do mapa | sem vínculo | aponta para a ficha do Cenário (arrastar em cima, ou seletor no painel) |
| Mapa: peças | sala, porta, símbolo, linha | + **corredor, sala em polígono, muralha, torre, escada** |
| Mapa: IA | rejeitada como "horrível" | em andamento na última rodada |

## Decisões que doeriam se revertidas sem saber por quê

Somam-se às do handoff anterior (cor da sala é ESTADO, porta é barra colorida, símbolo é ShapeUtil parametrizado, grade desligada ao abrir, `linha-mapa` continua registrado).

1. **Comparar conteúdo aplicando `marcarComoCopia`, nunca uma inversa dela.** `duplicata.ts` marca o perdedor com o id da cópia existente e compara as strings. A primeira versão escrevia a inversa à mão e **perdia dado**: desprefixava todas as versões da ficha, enquanto a original só toca a versão ativa. Inversa escrita à mão diverge da original em silêncio.
2. **Quem autoriza excluir cópia de conflito é `temMarcaDeCopia(caminho)`, não o prefixo do nome exibido.** O prefixo é texto que qualquer um digita — um cenário chamado "(conflito) na Ilha dos Piratas" ganhava botão que apagava a pasta única.
3. **A lixeira não tem registro compartilhado.** Cada exclusão guarda o próprio `entrada.json` em `.lixeira/<id>/`. Um `lixeira.json` único seria classificado como entidade pelo sync e geraria cópia de conflito cujas entradas a interface nunca leria. Conflito eliminado por desenho, não tratado.
4. **`onDoubleClick` de shape SEMPRE devolve uma mudança.** Sem retorno truthy, o `Idle` do SelectTool cria um shape de texto no ponto (`node_modules/tldraw/.../Idle.ts:312-336`). Todo duplo clique numa sala sujava o mapa antes de alguém notar.
5. **O desenho de cada peça é função pura em `src/lib/desenho*.tsx`.** O shape e a página de amostra chamam a MESMA função. Escrever uma segunda versão para a amostra seria julgar uma maquete.
6. **Cor por estado foi mantida contra dois críticos** que pediram monocromático. Decisão explícita do usuário: é o que ele lê de relance no meio da cena. O que se aproveitou das críticas foi baixar a saturação.
7. **Rótulo da sala ancorado no TOPO.** Duas formas independentes no tldraw não se enxergam, então não há detecção de colisão possível — a âncora resolve qualquer combinação futura.
8. **Escala dos controles do card tem PISO e TETO, e o teto ganha.** Quando os dois brigam, botão que estoura o card quebra a leitura da ficha, que é a função do card.

## Ferramenta nova: harness visual do mapa

O tldraw não roda em jsdom e o app Tauri não abre no ambiente de desenvolvimento — julgar aparência era chute. Agora:

```
npx vitest run src/test/amostraMapa.test.ts   # gera .amostra/mapa.html
node scripts/servirAmostra.mjs                # serve em 127.0.0.1:4599
```

Depois `http://127.0.0.1:4599/mapa.html` no Playwright e print. O Playwright **recusa `file:`** — daí o servidor.

**Armadilha do harness:** ele julga o que você desenha nele. A primeira amostra tinha vãos deliberados entre salas, e um crítico reprovou "retângulos soltos" — defeito do exemplo, não do editor. Amostra malfeita difama o produto; amostra maquiada esconde defeito. Desenhe como um usuário competente desenharia.

## Armadilhas já pagas (além das do handoff anterior)

- **Texto localizado de SO não é contrato.** `candidatosDeCopia` distinguia "pasta não existe" de erro real por regex na mensagem; o Windows em português diz "não PODE encontrar" e o padrão procurava "não encontrad". Todo primeiro conflito logava alarme falso, e o teste não pegou porque fabricava a mensagem em inglês.
- **Quantização de piso arredonda para CIMA.** `Math.round` num piso derruba o valor abaixo dele.
- **Validar tipo sem validar volume é meia validação.** Rótulo de 1 MB vira 41.667 nós de texto SVG numa sala; 20.000 salas custam 367 ms na checagem O(n²) antes de desenhar nada.
- **`updateShape` recusa shape travado em silêncio**, como `deleteShapes`. Soltar cenário sobre sala travada não criava vínculo nem card: o drop sumia.
- **Prop nova em shape existente exige migração**; shape NOVO não (documento antigo não contém o tipo). `src/test/migracaoSalaCenarioId.test.ts` monta um `TLSchema` real e chama `migratePersistedRecord` — é evidência, não inferência.
- **Comentário que justifica constante com premissa falsa é pior que comentário nenhum.** O debounce da teia era 1500ms "porque salva a cada pixel"; salva uma vez, no mouseup.

## Pendências

1. **Nada desta sessão foi visto rodando no app.** Os testes provam lógica; a tela não foi verificada. Prioridade ao abrir: painéis do mapa com sala selecionada cheia · card do canvas com retrato enquadrado fora do centro · arrastar nó na Teia, fechar e reabrir · Ctrl+K · excluir e restaurar da lixeira · gerar mapa por IA com chave real.
2. **O conserto do conflito só foi verificado com disco e Drive falsos.** Precisa de dois computadores sincronizando de verdade.
3. **Mobília (mesa, cama, baú) continua retângulo chapado** — crítico apontou que só se distinguem pela cor.
4. **Silhueta ainda é ortogonal.** As referências têm curva e chanfro; o polígono permite chanfro, curva não.
5. `npm run build` avisa que o bundle passa de 500 kB.

## Contexto operacional

- Convenções: pt-BR; TDD nas libs puras; `npx tsc --noEmit` + `npx vitest run` antes de cada commit; **API do tldraw sempre conferida em `node_modules/`** (v4.5.12).
- Cofre do usuário: `C:\Users\gedasio.filho\OneDrive - Vertis Capital\Documentos\Grimorio` (dentro do OneDrive).
- Ao mudar aparência, **pedir referência visual antes de implementar**.
- Publicar versão: subir `version` em `src-tauri/tauri.conf.json` (é ela que manda), commit, push, `gh workflow run release.yml`, testar o rascunho, `gh release edit v<version> --draft=false`.

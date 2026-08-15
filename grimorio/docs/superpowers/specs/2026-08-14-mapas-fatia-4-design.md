# Mapas — fatia 4: o mapa parece um mapa

**Data:** 2026-08-14 · **Status:** aprovado pelo usuário (conversa de 14/08, pós-fatia 3)
**Spec base:** `2026-08-14-mapas-design.md` (v1, fatias 1-3, já entregues e mergeadas)

## Motivação

As fatias 1-3 entregaram as ferramentas de precisão: camadas, réguas, painel numérico
X/Y/L/A, alinhar/distribuir, zoom. O mapa **funciona** mas não **parece** um mapa de RPG
publicado. A referência do usuário são as plantas do Resident Evil: sala preenchida com
contorno fino, porta como vão de verdade, rótulo de cômodo, legenda.

Esta fatia cuida da aparência e do vocabulário de peças. Andares lado a lado e velocidade
de desenho ficam para fatias seguintes — decisão do usuário de atacar aparência primeiro,
porque é ela que define o que é uma "peça", e as outras duas frentes reusam esse
vocabulário.

## Decisões tomadas (com o usuário, 14/08)

| Decisão | Escolha |
|---|---|
| Estética | Sala **preenchida** com contorno fino claro (estilo RE) + porta como **vão real** (interrupção do contorno + arco), não marca por cima |
| Dono do vão | Porta é **peça solta** posicionada por cima, que finge o buraco — a sala continua sendo forma comum do tldraw (gira, estica, troca cor) |
| Cor do vão | A porta **se pinta sozinha** com a cor da forma sob ela, ao criar E ao terminar de arrastar |
| Repintar desenho antigo | **Converter seleção em ▸ peça** (o usuário classifica). Nada de adivinhar por formato/cor |
| Legenda | **Bloco desenhado**, gerado com 1 clique a partir das peças presentes no mapa, editável depois como qualquer forma |
| Onde ficam as peças | **Gaveta "Peças ▾"** na toolbar, grade flutuante com os nomes — ícone solto não se distingue quando são 10 |
| Peças novas | Rótulo, Móvel, Passagem secreta, Armadilha, Marcador numerado |
| Entrega | **Duas levas**: 4a (peças) verificável antes de 4b (comandos) |

## A base: identidade da peça

Hoje a paleta só **pinta** a próxima forma (`setStyleForNextShapes`) — a forma não guarda
em lugar nenhum que é uma sala. Toda peça criada pela paleta passa a carimbar
`meta.peca = ElementoPaleta['id']`.

É o que destrava três pedidos de uma vez:

- **Legenda** sabe quais símbolos existem no mapa (varre `meta.peca`).
- **Converter seleção** tem o que gravar.
- Abre caminho para contagem e filtro por tipo em fatias futuras.

O carimbo entra no mesmo `registerBeforeCreateHandler` que já marca `meta.camada`
(`MapaView.tsx`), lendo a peça ativa da toolbar. Forma sem `meta.peca` (desenho antigo,
colado de outro canvas) é simplesmente "sem peça" — nunca um erro.

## Peças

| Peça | Implementação | Estado |
|---|---|---|
| Sala | geo rectangle, `color green, fill solid, dash solid, size s` | **existe e JÁ está no estilo escolhido** — nada a mudar (conferido em `paletaMapa.ts`) |
| Parede, Janela | geo pré-estilizado | existem |
| Escada | grupo de retângulos (botão de ação) | existe |
| **Porta** | **`PortaShape` — ShapeUtil próprio** | **nova, a única complexa** |
| **Rótulo** | text shape com `color white, size s`, centralizado — lê sobre o preenchimento sem ajuste manual | nova |
| **Móvel** | geo rectangle neutro | nova |
| **Passagem secreta** | geo pré-estilizado, traço distinto | nova |
| **Armadilha** | geo pré-estilizado (marcador de perigo) | nova |
| **Marcador numerado** | geo ellipse com `richText`, numerando a partir do maior número já presente | nova |

### PortaShape

Único desenho próprio da fatia. Renderiza, em SVG:

1. um retângulo **da cor do preenchimento sob ela**, cobrindo o trecho de parede (é o
   "buraco");
2. as duas jambas (traços curtos na cor do contorno, delimitando o vão);
3. o arco de abertura.

**Auto-cor** (API verificada, não chutada):

- ao criar: `ShapeUtil.onBeforeCreate` (node_modules/@tldraw/editor/src/lib/editor/shapes/ShapeUtil.ts:615)
- ao soltar depois de arrastar: `ShapeUtil.onTranslateEnd(initial, current)` (ShapeUtil.ts:763)
- o que está embaixo: `editor.getShapesAtPoint(point, { hitInside: true })`
  (node_modules/@tldraw/editor/src/lib/editor/Editor.ts:5502-5505)

Regra: pega a forma mais ao topo sob o centro da porta que tenha `meta.peca === 'sala'`;
sem sala embaixo, mantém a cor padrão de sala. A lógica de escolha é função pura
(`corDoVao(formasSob, padrao)`), testável sem editor.

A porta nasce à frente da sala (`editor.bringToFront`, Editor.ts:6780) — ver Riscos.

### Marcador numerado

`richText` é campo real do geo shape (node_modules/@tldraw/tlschema/src/shapes/TLGeoShape.ts:109),
com helper `toRichText()` (:141). O próximo número sai de função pura
`proximoNumero(marcadoresExistentes)`: maior número presente + 1, começando em 1 — de
modo que apagar o marcador 3 de 5 não gera número repetido no próximo.

## Comandos

### Converter seleção em ▸ peça

Aplica os estilos da peça E carimba `meta.peca` nas formas selecionadas. Serve para o
mapa antigo e para consertar peça errada no dia a dia. Não converte para `porta`: a porta
é shape próprio, não estilo — converter para porta é criar outra forma, e isso fica fora
desta fatia (o usuário desenha a porta nova por cima).

### Inserir legenda

1. varre as formas da página, coleta os `meta.peca` distintos;
2. monta a lista (função pura `entradasDaLegenda(pecasPresentes)` — devolve símbolo +
   nome, na ordem canônica da paleta, ignorando peça sem símbolo próprio);
3. cria o bloco: moldura + uma linha por entrada (mini-desenho da peça + texto), tudo
   agrupado com `editor.createShapes` + `editor.groupShapes` (mesmo caminho já usado pela
   Escada em `MapaToolbar.tsx`), posicionado no canto do viewport.

Depois de criado é desenho comum: move, edita, apaga linha. Não se atualiza sozinho —
gerar de novo cria outra legenda.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `src/lib/paletaMapa.ts` | cresce com as peças novas; continua lógica pura |
| `src/lib/legendaMapa.ts` (novo) | `entradasDaLegenda(pecas)` — o que a legenda lista, sem tocar no editor |
| `src/lib/portaMapa.ts` (novo) | `corDoVao(...)`, `proximoNumero(...)` — decisões puras da porta e do marcador |
| `src/components/PortaShape.tsx` (novo) | ShapeUtil da porta (SVG + auto-cor) |
| `src/components/GavetaPecas.tsx` (novo) | grade flutuante com as peças nomeadas |
| `src/components/MapaToolbar.tsx` | perde os botões soltos de peça, ganha "Peças ▾", "Converter ▸" e "Legenda" |
| `src/components/MapaView.tsx` | registra o `PortaShape`; carimba `meta.peca` no side effect de criação |

A divisão segue o padrão que a fatia 3 firmou: **decisão em lib pura testável, efeito no
componente**. Nenhuma das funções puras acima precisa do editor tldraw para ser testada.

## Entrega

### Leva 4a — as peças

Identidade (`meta.peca`), gaveta "Peças ▾", `PortaShape` com auto-cor, Rótulo, Móvel,
Passagem secreta, Armadilha, Marcador numerado. A Sala não entra: já está no estilo certo.

**Verificação (usuário, no app):** desenhar duas salas e ligar com uma porta — o contorno
abre e o arco aparece; arrastar a porta para uma sala de outra cor e ver o vão acompanhar;
inserir três marcadores e conferir a numeração 1, 2, 3; escrever um rótulo dentro da sala
e ler sem ajustar nada.

### Leva 4b — os comandos

Converter seleção em ▸ peça, Inserir legenda.

**Verificação (usuário, no app):** abrir um mapa antigo, selecionar os retângulos, virar
Sala e ver o estilo novo; inserir a legenda e conferir que lista só o que o mapa usa.

## Testes

- **Unit (vitest, libs puras):** `corDoVao` (com sala embaixo, sem nada embaixo, várias
  formas empilhadas), `proximoNumero` (vazio, com buracos na sequência, número não
  numérico), `entradasDaLegenda` (mapa vazio, peça repetida, peça sem símbolo), paleta
  (peças novas com estilos válidos contra o tlschema).
- **Manual (app):** tudo que envolve o editor tldraw — desenho, auto-cor ao arrastar,
  gaveta, legenda. Como nas fatias anteriores: reportado explicitamente, nunca presumido.

## Riscos conhecidos (declarados, não descobertos depois)

1. **Empilhamento.** A porta precisa ficar à frente da sala. Ela nasce na frente
   (`bringToFront`), mas desenhar uma sala nova por cima cobre a porta — o usuário
   resolve com "trazer para frente" do próprio tldraw.
2. **Auto-cor é heurística.** A porta assume a cor da sala sob o seu centro. Porta na
   divisa de duas salas de cores diferentes vai escolher uma das duas.
3. **Sala de formato livre.** O vão fingido funciona em qualquer contorno, mas a porta é
   um retângulo reto: em parede curva/diagonal o usuário precisa rotacionar a porta na
   mão.

## Fora de escopo (fatia 4)

- Andares lado a lado com rótulo (fatia seguinte)
- Velocidade de desenho: duplicar em série, repetir última peça, atalhos (fatia seguinte)
- Converter seleção **para** porta (a porta é shape próprio, não estilo)
- Legenda que se atualiza sozinha
- Mapa do mestre vs mapa dos jogadores (esconder armadilha/secreta na exportação)

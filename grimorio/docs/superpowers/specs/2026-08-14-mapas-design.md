# Mapas — editor vetorial de plantas no Grimório

**Data:** 2026-08-14 · **Status:** aprovado pelo usuário (conversa de 14/08)

## Motivação

O usuário desenha plantas de masmorra/castelo (ex.: "L1" do castelo do Reino de Goa) no
canvas atual, que serve para anotação livre. Falta um lugar feito para MAPA: formas
alinhadas, grade, medidas, paleta de elementos de RPG (parede, porta, escada) e camadas —
"estilo Figma". A dor concreta: deixar tudo alinhado, medir, e desenhar rápido no estilo
traço-branco-sobre-preto que ele já usa.

## Decisões tomadas (com o usuário, 14/08)

| Decisão | Escolha |
|---|---|
| Natureza do editor | **Vetorial** (formas editáveis), não raster nem tile-based |
| Motor | **tldraw reaproveitado** — mesmo do canvas atual; nada de segundo motor |
| Onde vive | **Novo tipo de documento "Mapa"**, seção própria "Mapas" na sidebar |
| Organização | Lista **plana** (como Canvases Soltos); pastas ficam para depois |
| Integração | Aceita **cards de entidade** (drop de personagem/cenário/item) além do desenho |
| Unidade de medida | **Quadrados da grade** (1 quadrado = 1 célula; padrão RPG de mesa) |
| Migração do canvas antigo | **Copiar/colar manual** (mesmo motor, clipboard funciona); sem código de migração |
| Export | **PNG/SVG na v1**, reusando o `exportar()` do CanvasView |
| Escopo v1 | Kit básico + paleta RPG + medidas + camadas, entregues em 3 fatias |

APIs do tldraw validadas via context7 antes deste design: `getShapeVisibility` (esconder
forma por `meta` — base das camadas), `components.Toolbar` (toolbar própria),
`OverlayUtil` (overlay de medidas no canvas), `isGridMode` + componente `Grid` custom.

## Modelo de dados

`MapaDoc` — mesmo formato do `CanvasDoc`, com camadas ao lado do documento:

```ts
interface MapaDoc {
  id: string
  nome: string
  documento: unknown | null      // snapshot tldraw { document, session }
  camadas: CamadaMapa[]          // novo — só em mapa
  criadoEm: string
  modificadoEm: string
}

interface CamadaMapa {
  id: string
  nome: string        // "Base", "Paredes", "Rótulos"…
  oculta: boolean
  travada: boolean
}
```

- Arquivo: `mapas-soltos/<slug>.json` no cofre.
- Cada shape do tldraw carrega `meta.camada = CamadaMapa['id']`. Shape sem `meta.camada`
  (colado do canvas antigo) pertence à primeira camada.
- Mapa novo nasce com uma camada "Base".

**Sync: zero mudança.** `politicaDoCaminho` já classifica qualquer `.json` não-metadado
como `entidade`; a cópia de conflito ganha id novo e nome prefixado pelo campo `nome`,
que o `MapaDoc` tem. A releitura pós-sync (`recargasDoDisco`) também já cobre o novo
editor, porque ele reusa o mesmo mecanismo do CanvasView.

## Arquitetura

### Reuso extraído do CanvasView (pré-fatia)

`CanvasView.tsx` hoje contém partes que o `MapaView` precisa por inteiro. Extrair para
módulo(s) compartilhado(s) — sem mudar comportamento do canvas:

- `criarAssetStore` / `criarStoreCanvas` (imagens em `imagens-canvas/`)
- Handlers de drop de entidade (MIME → card) e de imagem
- Hook de ciclo de vida do documento: carregar snapshot, autosave debounced (1s),
  save final no unmount, releitura quando `recargasDoDisco` sobe (com autosave
  pendente, releitura é pulada — local vence)
- `exportar(png|svg)`

CanvasView e MapaView passam a consumir esses módulos. Os testes existentes do canvas
continuam passando — extração é refactor puro.

### Fatia 1 — tipo Mapa ponta a ponta

- `VaultRepo`: reconhecer/criar `mapas-soltos/` (o `criarCanvasDoc(dir, nome)` já é
  genérico; criar mapa = mesmo doc com `camadas: [base]` no dir novo). `montarArvore`
  ganha `mapas: ItemRef[]`.
- `TipoAberto` ganha `'mapa'`; `Workspace` roteia para `MapaView`.
- `MapasSoltos.tsx` na sidebar: listar, criar, renomear, excluir, abrir (espelho de
  `CanvasesSoltos`).
- `MapaView.tsx`: tldraw com toolbar própria (selecionar, retângulo, elipse, linha,
  caneta, texto, borracha), grade ligada por padrão (`QUADRADO_PX = 32`), snap à grade,
  tema escuro (fundo preto, traço branco — o estilo do desenho do usuário), drops de
  entidade, export PNG/SVG.

**Verificação:** criar mapa pela sidebar, desenhar retângulo alinhado na grade, fechar e
reabrir (persistiu), arrastar um cenário da sidebar (virou card), exportar PNG.

### Fatia 2 — paleta RPG + medidas

- Ferramentas de paleta que criam formas já estilizadas: **parede** (retângulo/linha
  grossa, traço branco, preenchimento preto), **porta** (marcador laranja, como no
  desenho de referência), **escada** (retângulo com degraus), **janela**. Implementação:
  shape nativo (geo/line) pré-estilizado onde bastar; `ShapeUtil` custom (padrão
  `CharacterCardShape`) apenas para porta/escada, que têm desenho próprio.
- Medidas em quadrados via `OverlayUtil`: forma selecionada/redimensionando mostra
  `L×A` em quadrados (1 casa decimal quando não inteiro); exatamente duas formas
  selecionadas mostram distância entre bordas mais próximas, em quadrados.

**Verificação:** desenhar sala com paredes e porta em cliques, medida "6×4" visível ao
redimensionar.

### Fatia 3 — camadas + réguas

- Painel de camadas (lateral do MapaView): listar, criar, renomear, excluir (movendo
  shapes para a camada vizinha), olhinho (oculta), cadeado (trava), camada ativa.
- Esconder: `getShapeVisibility` lê `meta.camada` contra o estado das camadas.
- Travar: interceptar seleção/edição de shapes de camada travada (ou aplicar `isLocked`
  em massa ao travar/destravar — decidir no plano pelo que o tldraw fizer mais barato).
- Forma nova nasce na camada ativa (side effect na criação do shape).
- Réguas nas bordas do viewport, graduadas em quadrados (componente custom sobre o
  canvas; mesmo `QUADRADO_PX`).
- Persistência: `camadas` salvas no `MapaDoc` junto do autosave.

**Verificação:** criar camada "Rótulos", esconder → textos somem; travar "Paredes" →
parede não seleciona; fechar/reabrir mantém tudo.

## Testes

- **Unit (vitest):** árvore com `mapas-soltos`; px↔quadrados (formatação de medida);
  lógica pura de camadas (visibilidade, trava, camada de shape sem meta, remoção de
  camada); store (`TipoAberto 'mapa'`, abrir/fechar).
- **Component (jsdom):** seção Mapas na sidebar (criar/renomear/excluir), como os testes
  de `PainelSync` fazem.
- **Manual (app de verdade):** editor tldraw não roda em jsdom — desenho, snap, drops,
  export e camadas serão verificados no app e o resultado reportado explicitamente.

## Fora de escopo (v1)

- Pastas/subpastas na seção Mapas
- Migração automática canvas→mapa (copiar/colar resolve)
- Balde de tinta raster / borracha parcial de traço (mundo vetor: preenchimento é
  propriedade da forma; borracha apaga forma inteira)
- Mapa dentro de cenário (aba "Planta")
- Réguas com unidade configurável (metros/pés)

## Execução

- Worktree isolado: branch `feature/mapas`.
- Subagentes: `programador-frontend` implementa cada fatia; `revisor` ×3 dimensões em
  paralelo ao fim de cada fatia (correção, simplicidade, testes); `testador` para casos
  de borda das lógicas puras.
- Uma fatia por vez, verificável no app antes da seguinte.

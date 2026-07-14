# Imagem nas Notas — legenda, redimensionar, presets e alinhamento (Fase 1)

- **Data:** 2026-07-14
- **Status:** Aprovado (design), pronto para plano de implementação
- **App:** `grimorio` (Tauri 2 + React 19 + TipTap 3)
- **Autor da sessão:** brainstorming assistido

## Contexto

O editor de Notas (`src/components/NotasEditor.tsx`) usa TipTap 3 com as extensions `[StarterKit, ImagemCofre]`. Imagens são um node customizado (`src/components/ImagemCofre.tsx`) que estende `@tiptap/extension-image`: block-level, bytes gravados em arquivo separado no cofre (`imagens-notas/<id>.<ext>`), referência via `data-rel`. O conteúdo da página é persistido como **HTML string** (`editor.getHTML()`) no campo `corpo` de `<slug>.json` (`src/lib/notebookRepo.ts`).

Hoje a imagem **não** tem: redimensionar, legenda, presets de tamanho, nem alinhamento.

## Objetivo (Fase 1)

Melhorar o node de imagem que já existe para permitir, direto no editor de Notas:

1. **Redimensionar** arrastando as alças dos cantos, com proporção travada.
2. **Legenda** inline abaixo da imagem, opcional.
3. **Presets** de tamanho rápido: 25% / 50% / 100% da coluna.
4. **Alinhamento** da imagem na coluna: esquerda / centro / direita.

Tudo contido no node `ImagemCofre` (schema + NodeView React) + CSS. Sem node novo. Sem colunas.

## Não-escopo (fica pra Fase 2)

- Colunas estilo Notion (múltiplos blocos lado a lado, arrastar-pra-colunizar). É a feature pesada, terá spec própria.
- Legenda com formatação rica (negrito, link). Fase 1 = texto puro.
- Aplicar as mesmas features ao segundo editor TipTap do `PerfilModal.tsx` (corpo do personagem). Fica de fora — escopo é só o editor de Notas.

## Decisões do brainstorm

| Tema | Decisão |
|---|---|
| Resize | Alças nos **4 cantos**, **proporção travada** (largura e altura juntas, sem distorcer) |
| Legenda | Campo **inline abaixo**, aparece ao selecionar, **some se vazia**, centralizada / cinza / fonte menor, **texto puro** |
| Presets | Botões `25% / 50% / 100%` da largura da coluna |
| Alinhamento | `esquerda / centro / direita` |
| Unidade de largura | **% da coluna** (0–100), não px — unifica arrastar + presets e fica responsivo; teto 100% |

## Arquitetura

Toda a mudança vive no node de imagem já existente. Nenhum node novo, nenhuma mudança em como bytes de imagem são gravados/lidos.

### Atributos do node (`ImagemCofre`)

Adicionar/formalizar 3 atributos, todos serializáveis via `data-*` para sobreviver ao round-trip HTML:

| Atributo | Tipo | Default | Serialização | Aplicação |
|---|---|---|---|---|
| `legenda` | `string \| null` | `null` | `data-legenda` | `<figcaption>` abaixo da imagem |
| `largura` | `number \| null` (0–100, % da coluna) | `null` (tamanho natural) | `data-largura` | `style="width: N%"` na imagem |
| `align` | `'left' \| 'center' \| 'right' \| null` | `null` | `data-align` | margem/justify no wrapper `.nota-img` |

`src` continua neutralizado no `renderHTML` (nunca serializa caminho absoluto); `rel` continua como está. Altura **sempre `auto`** (a proporção se preserva sozinha ao fixar só a largura).

### parseHTML / renderHTML (round-trip)

- `parseHTML` continua casando `img[data-rel]`, agora lendo também `data-largura`, `data-align`, `data-legenda`.
- `renderHTML` emite os `data-*` correspondentes quando não-nulos.
- Exemplo do HTML persistido:

```html
<img data-rel="imagens-notas/ab12.png" data-largura="50" data-align="center" data-legenda="Mapa da cidade">
```

- Round-trip validado: `setContent(html)` → `getHTML()` preserva os três atributos.

### NodeView React (`ImagemView`)

O NodeView atual (resolve `src` em runtime via `convertFileSrc`, faz fallback "imagem não encontrada", e seta `application/x-grimorio-imagem` no `onDragStart` pra arrastar pro canvas) ganha:

1. **Estado de seleção** — usa a prop `selected` que o `ReactNodeViewRenderer` já passa. Alças, mini-barra e placeholder de legenda só aparecem quando `selected === true`.
2. **Alças de resize (4 cantos)** — pequenos elementos com `mousedown` próprio + `stopPropagation` (não disparam o drag-pro-canvas). Ao arrastar: captura largura do container e largura inicial; calcula nova largura em % (`clamp`); durante o arraste aplica largura via estilo local (fluido); no `mouseup` grava em `updateAttributes({ largura })`.
3. **Mini-barra flutuante** (acima da imagem, `contentEditable={false}`) — presets `25/50/100` (setam `largura`) e alinhamento `esq/centro/dir` (setam `align`). `stopEvent` para o ProseMirror ignorar os cliques.
4. **Campo de legenda** — `<figcaption>` editável abaixo da imagem. Sincroniza o texto digitado para `updateAttributes({ legenda })`. Placeholder "escreva uma legenda…" quando selecionada e vazia. Vazia + não selecionada = não renderiza. Texto puro (sem markup).

### Cálculo de largura (lógica pura, testável)

Extrair helper puro, sem DOM, pra facilitar teste:

```
calcularLarguraPct(larguraInicialPx, deltaPx, larguraContainerPx): number  // 0–100, com clamp [min, 100]
```

- Mínimo sugerido: ~10% (evita a imagem sumir). Ajustável.

### Preservado

- **Drag-pro-canvas**: arrastar o **corpo** da imagem continua disparando `onDragStart` com `application/x-grimorio-imagem`. Só as alças/mini-barra interceptam o mousedown.
- **Gravação de bytes**: nenhuma mudança em `copiarParaCofre` / `escreverBinario` / comandos Rust. Nada de base64 embutido no doc.
- **Autosave**: continua via `onUpdate` → `getHTML()` → debounce 800ms. `updateAttributes` dispara `onUpdate` normalmente.

## Comportamento (UX)

```
  selecionada:                          nao selecionada, com legenda:

  [25%][50%][100%] | [<][=][>]             +----------+
  [o]--------[o]                           |   img    |
   |   img    |                            +----------+
  [o]--------[o]                           Mapa da cidade
  escreva uma legenda...
```

- Alças + mini-barra + placeholder de legenda: só com a imagem selecionada.
- Legenda com texto: fica visível mesmo sem seleção.
- Alinhamento afeta a posição da imagem na coluna; a legenda acompanha (centralizada sob a imagem).
- Com `largura = 100`, alinhamento é irrelevante (ocupa a coluna).

## Retrocompatibilidade

Imagens já existentes nas notas não têm `data-largura` / `data-align` / `data-legenda`. Ao abrir:
- `largura = null` → tamanho natural (com `max-width:100%` já existente, nunca estoura).
- `align = null` → comportamento atual (block padrão).
- `legenda = null` → sem legenda.
- Já ficam redimensionáveis / alinháveis a partir do estado natural. Nenhuma migração de dados necessária.

## Testes e verificação

**Automatizado (vitest + jsdom):**
- Novo arquivo `src/test/imagemCofre.test.ts` com `// @vitest-environment jsdom` no topo (evita mudar `vite.config.ts` global — os testes de lógica pura atuais continuam em node).
- Casos:
  1. **Round-trip**: monta editor headless com `[StarterKit, ImagemCofre]`, `setContent` de HTML com `data-largura`/`data-align`/`data-legenda`, confirma que `getHTML()` preserva os três.
  2. **Retrocompat**: `setContent` de `<img data-rel="...">` sem os novos attrs → não quebra, `getHTML()` mantém `data-rel`, novos attrs ausentes.
  3. **Lógica pura**: `calcularLarguraPct` — clamp no mínimo, clamp no teto 100, cálculo proporcional correto.

**Manual (no app):**
- `npm run tauri dev`, abrir uma Nota, inserir imagem, verificar: arrastar canto redimensiona sem distorcer; presets 25/50/100 funcionam; alinhar esq/centro/dir; digitar legenda, desselecionar (some se vazia, fica se tiver texto); fechar e reabrir a nota (persistência). UI de drag/seleção não dá pra afirmar sem ver rodando.

## Arquivos afetados (estimativa)

| Arquivo | Mudança |
|---|---|
| `src/components/ImagemCofre.tsx` | Atributos `legenda`/`largura`/`align` (parse/render) + NodeView `ImagemView` (alças, mini-barra, campo de legenda, estado selecionado). Provável extrair `calcularLarguraPct`. |
| `src/theme.css` | Estilos: alças, mini-barra, `.nota-legenda`, classes de alinhamento. `.nota-img` já existe (linha ~227). |
| `src/test/imagemCofre.test.ts` (novo) | Testes de round-trip, retrocompat e `calcularLarguraPct`. |
| `src/lib/types.ts` | (Opcional) comentário do formato de `corpo` se valer documentar os novos `data-*`. |

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Campo de legenda (form/contentEditable dentro do NodeView) roubar seleção do ProseMirror | `contentEditable={false}` no wrapper da mini-barra + `stopEvent`/`stopPropagation` nos handlers; legenda sincroniza via `updateAttributes`. Validar no dev. |
| Alça de resize conflitar com drag-pro-canvas | Handlers separados nas alças com `stopPropagation`; corpo da imagem mantém `onDragStart`. |
| TipTap em jsdom para o teste de round-trip | Env por-arquivo (`// @vitest-environment jsdom`); se algo do TipTap não rodar em jsdom, cair pra teste focado em parse/render do schema. |
| Escopo maior que o "enxuto" inicial (4 comportamentos) | Tudo contido em 1 node + CSS + 1 teste; sem tocar persistência de bytes nem criar node novo. |

## Próximo passo

Plano de implementação detalhado (skill `writing-plans`), seguindo TDD: teste de round-trip + `calcularLarguraPct` primeiro, depois NodeView e CSS.

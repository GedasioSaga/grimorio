# Melhorias Cenários no Canvas — Design

Data: 2026-07-15
Branch: `feature/grimorio-v1`

## Contexto

O subsistema de Cenários já existe: cards no canvas tldraw (`CenarioCardShape`),
modal com 8 abas, hierarquia de pastas na sidebar (`CenarioNode.filhos`), e o
modelo `Cenario` já carrega os campos `eventos` e `itens` (HTML). Este design
adiciona 4 melhorias, todas concentradas no canvas e nos cards.

Stack relevante: Tauri v2, React 19, **tldraw 4.5**, zustand, TipTap.

### Decisões confirmadas com o usuário

1. **Origem das setas** = hierarquia da árvore (pai→filho). Não há relação
   cenário↔cenário manual; a única relação existente é o aninhamento de pastas.
2. **Controle de fonte** = botão A+ / A− por card (escala por card, persistida).
3. **Reconectar setas** = ferramenta de seta nativa do tldraw (sem código extra
   de "religar").

## Feature 1 — Setas automáticas (hierarquia pai→filho)

### Comportamento
- Ao dropar um cenário no canvas, se o pai e/ou filhos dele já têm card no canvas,
  cria automaticamente seta(s) `pai → filho` que seguem os cards ao mover.
- Desconectar: selecionar a seta e apagar (Delete nativo).
- Reconectar: ferramenta de seta do tldraw (manual, nativo).
- Auto-religa só no momento do drop. Seta apagada de propósito **não** é recriada
  (não rodamos o auto-link fora do drop).

### Implementação
- Nova lib pura `src/lib/ligacaoCenario.ts`:
  - `paresParaLigar(raiz: PastaCenarioNode, cenarioId: string): Array<{ paiId: string; filhoId: string }>`
    — devolve os pares pai→filho que envolvem `cenarioId` (o link com o pai + o
    link com cada filho direto). Reutiliza/estende os helpers de
    `lib/cenarioArvore.ts` (`encontrarCenarioNode`; adicionar `paiDoCenario`).
  - Função pura, testável isoladamente (sem tldraw).
- `CanvasView.tsx`, no `onDropCapture` do ramo cenário, **após** criar o card:
  - Coleta os cards de cenário do canvas: `editor.getCurrentPageShapes()` filtrando
    `type === 'cenario-card'`, mapeando `props.cenarioId → shapeId`.
  - Para cada par de `paresParaLigar(tree.cenarios, cenarioId)` cujos dois cards
    existem e ainda não têm seta entre eles, cria a seta com binding.
  - Guard de duplicata: `editor.getBindingsInvolvingShape(shapeId, 'arrow')` para
    checar se já existe seta ligando o par.
  - Criação: `createShape({ type: 'arrow', ... })` + `createBinding` (start no pai,
    end no filho), `normalizedAnchor { x:0.5, y:0.5 }`, `isPrecise:false`.
- I/O (tldraw) fica no `CanvasView`; a lógica de "quais pares" fica na lib pura.

### Casos de borda
- Dropar o pai quando filhos já estão no canvas → liga aos filhos.
- Dropar filho quando o pai já está → liga ao pai.
- Múltiplos cards do mesmo cenário no canvas: liga a todos os existentes que
  formam par (aceitável; raro).
- Cenário sem pai (raiz) e sem filhos no canvas → nenhuma seta.

## Feature 2 — Ctrl+C copia a imagem do card

### Comportamento
- Clicar na imagem (retrato) de um card de cenário ou personagem "arma" a imagem
  (anel de seleção sutil).
- `Ctrl/Cmd+C` com imagem armada copia a imagem como **PNG** para o clipboard do
  SO (colável em Word, chat, etc.).
- Clicar fora da imagem desarma.

### Implementação
- Extrair componente compartilhado `src/components/CardRetrato.tsx`: renderiza a
  `<img>` (ou fallback de inicial/ícone) + estado `erroImg`, usado por
  `CenarioCardShape` e `CharacterCardShape` (remove duplicação já existente).
  - Props: `src: string | null`, `alt`, `fallback: ReactNode`.
  - Ao clicar na imagem: `stopPropagation` + arma via um tracker de módulo
    (`armarImagem(src)`), aplica classe `.char-card-retrato--armado`.
- Handler global de teclado no container do canvas (mesmo lugar do handler de
  espaço em `CanvasView`, fase capture): em `Ctrl/Cmd+C` com imagem armada,
  `preventDefault` + `stopPropagation` (não deixa o tldraw copiar o shape) e
  chama a cópia. Clique no canvas/fora desarma.
- Lib `src/lib/copiarImagem.ts` isola o I/O:
  - `copiarImagemParaClipboard(src: string): Promise<void>`
  - Pipeline: `fetch(src) → blob → createImageBitmap(blob) → canvas 2d →
    canvas.toBlob('image/png') → navigator.clipboard.write([ClipboardItem])`.
  - Usar Blob/`createImageBitmap` evita canvas "tainted" (o bitmap vem de Blob,
    sem origem de rede). Asset protocol já habilitado (`scope: ["**"]`), então
    `fetch` do `convertFileSrc(...)` funciona.
  - Fallback, se `fetch` falhar: ler bytes via `fsBridge`/repo e montar Blob.

### Casos de borda
- Imagem ausente/erro (`erroImg`): não arma (nada a copiar).
- `navigator.clipboard.write` indisponível/sem permissão: log de erro, sem crash.
- Fonte jpg/webp: convertida para PNG pelo canvas (clipboard exige png).

## Feature 3 — Eventos e Itens no card do canvas

Os campos `Cenario.eventos` e `Cenario.itens` (HTML) já existem e já são editáveis
no modal. Falta expô-los no card do canvas, ao lado de Descrição e Informações.

### Comportamento
- Card de cenário expandido mostra 4 seções: **Descrição, Informações, Eventos,
  Itens**. Cada seção (exceto Descrição, que é a base) pode:
  - expandir/recolher;
  - alternar entre empilhada (abaixo, mesma coluna) ou ao lado (coluna própria) —
    botão `↓ / →`, igual ao "Informações" atual;
  - editar inline (✎) via `EditorInline`.

### Implementação
- Generalizar o render de painéis do `CenarioCardShape` para uma lista de seções:
  ```
  const SECOES = [
    { chave: 'descricao',  rotulo: 'Descrição',    base: true  },
    { chave: 'informacao', rotulo: 'Informações',  base: false },
    { chave: 'eventos',    rotulo: 'Eventos',      base: false },
    { chave: 'itens',      rotulo: 'Itens',        base: false },
  ]
  ```
  - Componente interno `SecaoCard` (uma seção: header com toggles + conteúdo/editor),
    parametrizado por `chave` (lê `c[chave]`, salva `salvarCenarioParcial(id, {[chave]: html})`).
- Novas props no shape `cenario-card`. `RecordProps` do tldraw é plano (sem mapas
  aninhados), então cada seção tem flags próprias:
  - **Mantém** os atuais `infoExpandido` / `infoAoLado` (Informações) — sem rename,
    evita migration extra.
  - **Adiciona** `eventosExpandido, eventosAoLado, itensExpandido, itensAoLado`
    (booleans, default `false`).
  - Descrição não tem flags (sempre visível quando o card está `expandido`).
- **Largura**: trocar o cálculo incremental (`ajustarLargura(delta)`) por recomputo
  a partir do número de colunas. Novo helper em `lib/cartaoCanvas.ts`:
  - `larguraDoCartao(colunasPaineis: number): number`
    `= CARD_LARGURA_PADRAO + colunasPaineis * PAINEL_DESCRICAO_LARGURA`
  - `colunasPaineis` = (1 se houver ≥1 seção empilhada visível) + nº de seções
    `aoLado` visíveis. Recalcula a cada toggle (expandir card, expandir seção,
    alternar aoLado).
- **Migrations** no `CenarioCardShapeUtil` (canvas já salvos com `cenario-card`
  ganham defaults `false` nas novas flags). Seguir o padrão de
  `createShapePropsMigrationSequence` já usado no `CharacterCardShape`.
- **Escopo:** só o `CenarioCardShape` muda. `CharacterCardShape` permanece com
  Descrição + Informações (personagem não tem eventos/itens).

### Casos de borda
- Seção com HTML vazio: mostra "Sem …" (itálico), como hoje.
- Todas as seções `aoLado`: card fica largo (várias colunas) — aceitável.

## Feature 5 — Botão A+ / A− por card (escala de fonte)

### Comportamento
- Cada card tem botões A− / A+ que aumentam/diminuem a fonte só daquele card.
- Escala default 1.0, clamp 0.8–2.0, passo 0.1. Persistida no snapshot do canvas.

### Implementação
- Nova prop `fonteEscala: number` (T.positiveNumber) nos dois shapes
  (`cenario-card` e `character-card`) + **migrations** (default 1).
- Aplicar como CSS var no root do card:
  `style={{ '--card-fe': fonteEscala, pointerEvents: 'all' }}` no `HTMLContainer`.
- Reescrever no `theme.css` as regras de `font-size` dos cards para
  `calc(<base>px * var(--card-fe, 1))`. Regras afetadas (~8):
  `.char-card-nome`, `.char-card-resumo`, `.char-card-secao-titulo`,
  `.char-card-info-toggle`, `.char-card-sem-descricao`, `.char-card-descricao`
  (+ `p/li/h2/h3`), `.char-card-inicial`, `.char-card-editor .tiptap` (+ headings).
- Botões A− / A+ num canto do card (controle discreto, `onPointerDown`
  `stopPropagation` para não arrastar o shape). Atualizam `fonteEscala` via
  `editor.updateShape` com clamp.

### Casos de borda
- Clamp nos limites (não passa de 0.8 nem 2.0).
- Escala grande + card pequeno: conteúdo rola dentro do painel (overflow já tratado).

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/lib/ligacaoCenario.ts` | **novo** — `paresParaLigar` (F1) |
| `src/lib/cenarioArvore.ts` | `paiDoCenario` (F1) |
| `src/lib/copiarImagem.ts` | **novo** — cópia PNG p/ clipboard (F2) |
| `src/lib/cartaoCanvas.ts` | `larguraDoCartao(colunas)` (F3) |
| `src/components/CardRetrato.tsx` | **novo** — retrato compartilhado + armar (F2) |
| `src/components/CanvasView.tsx` | auto-setas no drop (F1) + handler Ctrl+C (F2) |
| `src/components/CenarioCardShape.tsx` | 4 seções + largura + props/migrations (F3), `fonteEscala` (F5), usa `CardRetrato` (F2) |
| `src/components/CharacterCardShape.tsx` | `fonteEscala` + migration (F5), usa `CardRetrato` (F2) |
| `src/theme.css` | `--card-fe` nas fontes (F5), anel de armado (F2) |

## Testes

- Puros (`vitest`): `paresParaLigar` / `paiDoCenario` (F1); `larguraDoCartao` (F3).
- `npm run build` (tsc) — tipos das novas props/migrations.
- Manual (`npm run dev`):
  - F1: dropar cadeia pai→filho→neto → setas aparecem e seguem ao mover; apagar
    seta e re-dropar filho → religa.
  - F2: clicar retrato, Ctrl+C, colar em app externo → imagem PNG.
  - F3: expandir card, alternar Eventos/Itens empilhado/ao lado, editar inline.
  - F5: A+/A− muda só o card, persiste ao reabrir o canvas.

## Fora de escopo (YAGNI)

- Vínculo manual cenário↔cenário (só hierarquia).
- Botão dedicado de "religar" setas.
- Eventos/Itens como entidades próprias (continuam HTML, como no modelo atual).
- Escala de fonte global.

## Ordem de entrega

F5 (fonte) → F3 (seções) → F2 (copiar) → F1 (setas). Cada etapa testável isolada.

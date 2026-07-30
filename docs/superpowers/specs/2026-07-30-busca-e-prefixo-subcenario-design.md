# Busca na sidebar + prefixo do sub-cenário — Design

**Data:** 2026-07-30
**Status:** Aprovado — pronto para plano de implementação

## Objetivo

Duas adições independentes na sidebar:

1. **Busca por seção** em Personagens e Cenários. Digita o nome, a seção vira uma lista plana
   ranqueada do mais parecido pro menos.
2. **Prefixo herdado no sub-cenário.** Criar um cenário dentro de "Reino de Goa" oferece a
   sugestão `Reino de Goa: `; aninhando de novo vira `Reino de Goa: Castelo: Cozinha`.

## Decisões travadas (brainstorming 2026-07-30)

| Tema | Decisão |
|------|---------|
| Onde fica a busca | **Uma caixa por seção** (Personagens tem a sua, Cenários tem a sua). Não é busca global. |
| Modo de exibição | **Lista plana ranqueada.** Enquanto busca, hierarquia e pastas somem. |
| Casamento | **Trecho** (substring), normalizando minúscula e acento. Não é fuzzy. |
| Contexto do resultado | **Sim** — pasta em cinza ao lado do nome. |
| Prefixo do sub-cenário | **Chip clicável** abaixo do input. Campo nasce vazio; clicou, preenche. |
| Renomear pai | **Não propaga** pros filhos. |
| Arrastar-soltar durante busca | **Desligado** (arrastar e soltar). Volta ao limpar a busca. |

## Contexto do código (já existe — reusar)

- `PersonagensSoltos({ raiz, aoMudar, ocultos, aoMostrarTodos })` — `src/components/PersonagensSoltos.tsx:38`.
  Renderiza `PastaLinha` (recursiva) e `PersonagemLinha`. Raiz `'personagens-soltos'`.
- `CenariosSoltos({ raiz, aoMudar, ocultos, aoMostrarTodos })` — `src/components/CenariosSoltos.tsx:58`.
  Renderiza `PastaCenarioLinha` (recursiva), `CenarioLinha` (recursiva, tem `filhos`) e
  `PersonagemVinculadoLinha`. Raiz `'cenarios'`.
- `Sidebar` — `src/components/Sidebar.tsx:24`. Já aplica o filtro de campanha **antes** de passar
  `raiz` pras duas seções (`Sidebar.tsx:75-85`). A busca opera sobre essa raiz já podada.
- `filtroCampanha.ts` — `src/lib/filtroCampanha.ts`. Padrão do projeto: poda pura em `lib/`,
  componente só renderiza. A busca segue o mesmo molde, mas **achata** em vez de podar.
- `contarPersonagens(pasta)` — `filtroCampanha.ts:84`; `contarCenarios(raiz)` — `filtroCampanha.ts:93`.
  Reusar para o "N de M".
- `pedirTexto(titulo, valorInicial = '', confirmar = 'OK')` — `src/components/dialogos.tsx:42`.
  `HostDialogos` — `dialogos.tsx:47`. Store `useDialogo` com `pedido: PedidoAberto | null`.
- `novoSub` — `CenariosSoltos.tsx:200`. Hoje: `pedirTexto('Nome do sub-cenário:')`.
- Tipos — `src/lib/types.ts`: `ItemRef` (`:84`), `PastaNode` (`:104`), `CenarioNode` (`:123`),
  `PastaCenarioNode` (`:128`).
- CSS: `.rail-linha` (`theme.css:451`), `.rail-titulo` (`:454`), `.rail-acoes` (`:456`),
  `.sidebar-filtro` (`:100`), `.dialogo-input` (`:275`), `.dialogo-botoes` (`:280`).
  Tokens: `--fundo-elevado`, `--borda`, `--dourado`, `--dourado-claro`, `--texto`, `--texto-fraco`.

---

## Parte 1 — Busca por seção

### Arquivo novo: `src/lib/buscaArvore.ts` (puro, sem DOM/Tauri)

```ts
export interface Achado<T> {
  item: T          // ItemRef (personagem) ou CenarioNode (cenário)
  caminhoRotulo: string  // "Vilões/Capangas" — ancestrais legíveis, sem a raiz
  pontos: number
}

export function normalizar(s: string): string
export function pontuar(nome: string, termo: string): number | null
export function buscarPersonagens(raiz: PastaNode, termo: string): Achado<ItemRef>[]
export function buscarCenarios(raiz: PastaCenarioNode, termo: string): Achado<CenarioNode>[]
```

- **`normalizar`** — `toLowerCase()` + `normalize('NFD').replace(/\p{Diacritic}/gu, '')` + trim.
  `"João"` → `"joao"`, `"Reino de Goá"` → `"reino de goa"`.
- **`pontuar`** — devolve `null` se não casa. Senão, quanto **menor** melhor:
  - `0` — nome normalizado **começa** com o termo
  - `1` — alguma **palavra** do nome começa com o termo (limite `\b` sobre o normalizado)
  - `2` — contém em qualquer posição
  - Desempate na ordenação (nesta ordem): `pontos` → posição do primeiro match → `nome.length` →
    comparação alfabética por `localeCompare('pt-BR')`.
- **`buscarPersonagens` / `buscarCenarios`** — varrem a árvore inteira (subpastas + `filhos` de
  cenário), acumulando o rótulo de caminho. Termo vazio (após normalizar) devolve `[]` —
  o componente decide mostrar a árvore normal.
- **`caminhoRotulo`** — nomes dos ancestrais (pastas **e** cenários pais), sem a raiz, unidos por
  `/`. Mais de 2 níveis vira `…/penúltimo/último`. Item na raiz da seção → `''`.

### Alterações em `PersonagensSoltos.tsx` e `CenariosSoltos.tsx`

Estado local em cada seção: `const [busca, setBusca] = useState('')`. Não vai pro store,
não persiste.

Cabeçalho ganha, abaixo do `.sidebar-section-header`, uma `<CaixaBusca>`:

```
┌ Personagens ───────────── 📁+  + ┐
│ 🔍 [ joão            ]  2 de 41 ✕│
└──────────────────────────────────┘
```

- `input type="search"`, `placeholder="Buscar…"`.
- Contador `N de M`: `N` = resultados, `M` = `contarPersonagens(raiz)` / `contarCenarios(raiz)`.
- `✕` limpa. `Escape` no input também limpa (com `stopPropagation`, seguindo o padrão de
  `dialogos.tsx:76-79`).

Com `busca.trim() === ''` → renderiza a árvore de hoje, **caminho de código intocado**.
Com texto → renderiza `<ResultadoLinha>` para cada achado, no lugar das pastas/árvore.

**`ResultadoLinha`** reusa `.rail-linha` com `paddingLeft: 8` fixo, sem chevron:

```
👤 João Ferreira   · Vilões/Capangas   [🏷️ ✎ 🗑]
```

- Clique abre (`abrirPerfil` / `abrirCenario`), igual à linha normal.
- Botões de ação idênticos aos da linha de árvore — personagem: 🏷️ ✎ 🗑; cenário: + 🏷️ ✎ 🗑.
- `caminhoRotulo` vazio não renderiza o span (item na raiz).
- **`draggable={false}` e sem `onDragOver`/`onDrop`.** Sem pasta na tela não existe alvo, e soltar
  sobre um resultado moveria o item pra dentro dele sem contexto visual.

Zero resultado → `<div className="rail-vazio">Nada com "{busca}".</div>`.

O aviso `N ocultos pelo filtro` continua aparecendo (busca e filtro de campanha compõem:
campanha poda primeiro, busca acha dentro do que sobrou).

### Testes — `src/test/buscaArvore.test.ts`

- `normalizar` tira acento e caixa: `"João"` e `"joao"` casam.
- Ordem do ranking: termo `"cast"` sobre `["Castelo Velho", "Reino de Goa: Castelo", "Alcaste"]`
  devolve prefixo → palavra → meio, nessa ordem.
- Desempate por nome mais curto quando os pontos empatam.
- `caminhoRotulo` corta em 2 níveis com `…/` e fica `''` na raiz.
- Cenário aninhado aparece com o pai no rótulo.
- Termo vazio devolve `[]`; termo sem match devolve `[]`.

---

## Parte 2 — Prefixo do sub-cenário

### `src/components/dialogos.tsx`

- `PedidoAberto` ganha `sugestao?: string`.
- `useDialogo.pedir(titulo, valorInicial, confirmar, sugestao?)`.
- `pedirTexto(titulo, valorInicial = '', confirmar = 'OK', sugestao?: string)` — 4º parâmetro
  opcional. Os 23 chamadores existentes não mudam.
- `HostDialogos`: quando `pedido.sugestao` existe **e** o input ainda está no `valorInicial`,
  renderiza abaixo do input:

```tsx
<button className="dialogo-sugestao" onClick={aplicarSugestao}>
  💡 {pedido.sugestao}…
</button>
```

  `aplicarSugestao` → `setValor(pedido.sugestao)` + foca o input e põe o cursor no fim
  (`setSelectionRange(len, len)`, **não** `select()` — selecionar apagaria o prefixo ao digitar).
  O chip some assim que o valor difere do inicial.

### `src/components/CenariosSoltos.tsx`

`novoSub` (`:200`) passa a sugestão:

```ts
const nome = await pedirTexto('Nome do sub-cenário:', '', 'OK', `${node.nome}: `)
```

Aninha sozinho: o nome do pai já carrega a cadeia inteira, então filho de
`Reino de Goa: Castelo` sugere `Reino de Goa: Castelo: `. Não precisa varrer a árvore.

**Escopo:** só sub-cenário dentro de cenário. Pasta (`criar('cenario' | 'pasta')` em
`PastaCenarioLinha`), personagem e canvas **não** ganham chip — pasta não é ancestral nominal.

**Renomear o pai não reescreve os filhos.** Aqui o nome é texto livre, não caminho: propagar
reescreveria N arquivos e sobrescreveria nome ajustado à mão. Fica fora do escopo.

### Testes — `src/test/dialogos.test.ts` (acrescentar)

- `pedirTexto` com sugestão guarda `sugestao` no `pedido`; sem ela fica `undefined`.
- Chamada de 3 parâmetros continua funcionando (regressão dos 23 call sites).

---

## O que NÃO muda

- Filtro de campanha e o aviso "N ocultos".
- Arquivos no disco, formato do JSON, slug, sync com o Drive.
- Árvore renderizada quando a busca está vazia — mesmo código de hoje.
- Nome do cenário no disco: o prefixo é só texto digitado, o slug segue a regra atual.

## Verificação

- `npx tsc --noEmit`
- `npm test` (vitest)
- Manual: buscar "joao" acha "João"; limpar a busca devolve a árvore; criar sub-cenário
  dentro de "Reino de Goa" mostra o chip e o clique preenche.

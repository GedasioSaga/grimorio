# Chips de páginas na barra recolhida — Design

Data: 2026-07-14
Branch: feature/grimorio-v1

## Problema

Nas Notas, a sidebar "☰ Páginas" é binária: expandida (coluna 200px com a
árvore completa) ou recolhida (`railRecolhida=true` → só uma barra-miniatura
horizontal com o botão "☰ Páginas"; a árvore é desmontada). Quando recolhida,
nenhum nome de página aparece — para trocar de página é preciso expandir.

Desejo do usuário: com a barra recolhida, mostrar os nomes das páginas ao lado
de "☰ Páginas" e permitir clicar para ir direto à nota, sem expandir.

## Decisões (fechadas com o usuário)

- **Formato:** chips inline na própria barra-miniatura (não flyout, não rail vertical).
- **Overflow:** scroll horizontal, linha única (roda do mouse rola lateral).
- **Escopo das páginas:** todas, em lista plana (DFS pré-ordem), achatando a hierarquia.
- **Página ativa:** chip destacado.
- **Clicar chip:** navega (`setPaginaAtiva`) e **mantém** recolhido.

## Arquitetura atual relevante

- `Workspace.tsx:104-108` — render da miniatura quando `split.railRecolhida`.
  Hoje só o botão "☰ Páginas" (`onClick` seta `railRecolhida:false`).
- `Workspace.tsx:110` — quando expandida, renderiza `<PaginasRail repo cadernoDirRel onRecolher />`.
- `PaginasRail.tsx:30-45` — carrega a árvore via `repo.inicializar().then(() => repo.montarArvore())`,
  guarda em estado local. Quando recolhida, `PaginasRail` é **desmontado** → a árvore some.
- Navegação: `setPaginaAtiva(cadernoDirRel, slug)` no store (`store.ts:85`); `Workspace`
  observa `slugAtivo` e remonta `<NotasEditor key={slugAtivo}>`. Sem router/URL.
- `repo` (`NotebookRepo`) é instância única compartilhada (Workspace), fila serializada — reuso é seguro.
- Estrutura: `PaginaNode extends PaginaRef` = `{ slug, id, titulo, erro?, paiId, ordem, filhos: PaginaNode[] }` (`types.ts:61-83`).

## Solução

Como a miniatura não tem acesso à árvore carregada pela `PaginasRail` (desmontada),
um componente próprio carrega a lista plana via o mesmo `repo`.

### 1. Helper puro — `grimorio/src/lib/achatarPaginas.ts`

```
achatarPaginas(nodes: PaginaNode[]): { slug: string; titulo: string; erro?: boolean }[]
```

DFS pré-ordem: para cada nó, empurra `{slug, titulo, erro}` e recursa em `filhos`.
Puro, sem I/O — testável isolado. Segue o padrão de helpers do projeto
(`calcularLarguraPct`, `paragrafoFinal`).

### 2. Componente — `grimorio/src/components/PaginasChips.tsx`

Props: `{ repo: NotebookRepo; cadernoDirRel: string }`.

- Estado local `paginas` (lista plana | null).
- `useEffect([repo])`: `repo.inicializar().then(() => repo.montarArvore())` → `achatarPaginas` → set.
  Em erro, lista vazia (espelha `PaginasRail`).
- Lê `slugAtivo` e `setPaginaAtiva` do store (`useApp`), igual `PaginasRail`.
- Render: faixa `.rail-chips` com um `<button class="rail-chip">` por página.
  - Título como texto; ativa (`slug === slugAtivo`) → classe `.ativa`.
  - `erro` → `disabled`, `title="Página com erro"`.
  - `onClick` (não-erro) → `setPaginaAtiva(cadernoDirRel, slug)`. **Não** toca `railRecolhida`.
  - `onWheel`: converte `deltaY` em `scrollLeft` para rolar lateral com a roda.
- Sem páginas / carregando → não renderiza chips (retorna `null` ou fragmento vazio).

### 3. Workspace.tsx (miniatura)

Dentro de `.rail-miniatura` (`:106-108`), após o botão "☰ Páginas":

```
<PaginasChips repo={repo} cadernoDirRel={cadernoDirRel} />
```

### 4. CSS — `grimorio/src/theme.css` (junto de `.rail-miniatura:269-276`)

- `.rail-miniatura`: `display:flex; align-items:center; gap` (row).
- `.rail-chips`: `display:flex; gap; overflow-x:auto; white-space:nowrap; flex:1;`
  scrollbar fina.
- `.rail-chip`: pill pequeno; hover; `.ativa` usa o dourado do tema; `:disabled` esmaecido.

## Bordas

- Sem páginas → só o botão "☰ Páginas".
- Página com `erro` → chip desabilitado.
- Carregando / erro de load → sem chips.
- Clicar chip nunca altera `railRecolhida`.
- Páginas só mudam via rail expandida (a miniatura não cria/renomeia/exclui);
  carregar uma vez no mount é suficiente.

## Testes (TDD)

- `achatarPaginas.test.ts`:
  - DFS pré-ordem com aninhamento (ordem correta pai→filhos).
  - Lista vazia → `[]`.
  - Preserva `erro`.
- `PaginasChips.test.tsx` (jsdom):
  - Renderiza N chips a partir de árvore mockada (`repo.montarArvore`).
  - Clicar chip chama `setPaginaAtiva(cadernoDirRel, slug)` com o slug certo.
  - Chip da página ativa tem classe `.ativa`.
  - Página com `erro` → chip desabilitado.

## Fora de escopo

Rail expandida, drag/drop, criação/rename/exclusão — intactos. Sem router/URL.
Sem persistir estado de scroll dos chips.

# Grimório — Escrita (Notas + Split) — Design

**Data:** 2026-07-13
**Status:** Aprovado pelo usuário
**Depende de:** `2026-07-13-grimorio-design.md` (v1 já implementada)

## Visão

Segunda parte do Grimório: um espaço de escrita estilo Notion/Obsidian dentro do app. O mestre escreve a sessão em páginas de texto rico aninhadas, insere imagens, e vê essas notas **lado a lado com o mapa mental** (canvas tldraw da sessão). Ambos os painéis (Notas e Mapa) recolhem com animação suave. Imagens podem ser arrastadas de uma página para dentro do mapa.

## Conceito central: Caderno

Uma peça reutilizável — o **Caderno** — é uma pasta de páginas formando uma árvore. Aparece em dois contextos:

1. **Notas da sessão** — caderno embutido em cada sessão, mostrado ao lado do Mapa da sessão.
2. **Escrita da campanha** — caderno livre por campanha (lore, mundo, regras), em tela cheia, sem mapa.

Os dois contextos usam o mesmo código de caderno (mesma camada de dados, mesma árvore de páginas, mesmo editor). A única diferença é a localização no cofre e se há um mapa ao lado.

## Modelo de dados

### Página (`<pagina-slug>.json`)

```json
{
  "id": "uuid",
  "titulo": "O Gancho",
  "paiId": "uuid-ou-null",
  "ordem": 0,
  "corpo": "<html do TipTap>",
  "criadoEm": "ISO-8601",
  "modificadoEm": "ISO-8601"
}
```

- Árvore montada a partir de `paiId` (null = raiz) + `ordem` (posição entre irmãos).
- Aninhar (mudar pai) ou reordenar altera apenas `paiId`/`ordem` — o arquivo e o `id` permanecem estáveis, então nenhuma referência quebra (mesma filosofia de `renomearItem` na v1: renomear muda o campo `titulo`, não o arquivo/slug).
- `corpo` é HTML gerado pelo TipTap.

### Armazenamento no cofre (sem migração)

O canvas de sessão da v1 (`sessoes/<sessao-slug>.json`) permanece **intocado**. Cadernos são novos e vivem em paralelo:

```
campanhas/<camp-slug>/
  sessoes/<sessao-slug>.json          # mapa da sessão (canvas, v1 — inalterado)
  sessoes/<sessao-slug>.notas/        # caderno da sessão (novo)
    <pagina-slug>.json
  escrita/                            # caderno livre da campanha (novo)
    <pagina-slug>.json
imagens-notas/                        # imagens das páginas (nível do cofre)
  <uniqueId>.<ext>
```

- Uma pasta `<sessao-slug>.notas` coexiste com o arquivo `<sessao-slug>.json` (Windows permite). `montarArvore` lista apenas `*.json` como itens e ignora diretórios, então a pasta de notas não polui a árvore de sessões.
- O caderno é identificado pela pasta; o slug da sessão é estável (rename não muda slug na v1), então a associação sessão↔caderno nunca quebra.

### Imagens portáveis

- Imagem inserida numa página é salva em `imagens-notas/<uniqueId>.<ext>` no cofre.
- No HTML da página, o `<img>` guarda o **caminho relativo ao cofre** (ex.: atributo `data-rel="imagens-notas/abc.png"`); a renderização resolve para URL exibível via `convertFileSrc(vaultPath + '/' + rel)`. Isso mantém portabilidade entre os 2 PCs (mesmo esquema do asset store do mapa na v1: guarda relativo, reconstrói absoluto).

## UI — Split da sessão (Layout A)

À direita da sidebar do Cofre, o workspace da sessão tem três regiões:

1. **Páginas** — árvore do caderno da sessão (coluna estreita). Criar, renomear, excluir, aninhar, reordenar. Página ativa destacada.
2. **Notas** — editor TipTap da página ativa.
3. **Mapa** — o `CanvasView` da v1 (inalterado como componente).

Controles:
- **`‹` recolher Notas** → mapa em tela cheia. **`‹` recolher Mapa** → escrita (Páginas + Notas) em tela cheia.
- **`⇔` divisória** entre Notas e Mapa arrasta para redimensionar.
- Animação suave (~220 ms, ease) ao recolher/expandir. A proporção do split e o estado recolhido são lembrados por sessão em `localStorage`, chaveados pelo caminho da sessão (não tocam no schema do arquivo da sessão).

**Escrita livre da campanha:** abre o mesmo par Páginas + Notas, **sem Mapa**, em tela cheia. Acessível por uma entrada "Escrita" na sidebar, sob cada campanha.

## Editor de página

TipTap (já usado no PerfilModal) + extensão de imagem. Toolbar: negrito, itálico, H1/H2/H3, lista com marcadores, lista numerada, citação (blockquote), divisória (hr), inserir imagem.

- **Inserir imagem:** dialog de arquivo → copia para `imagens-notas/` → insere `<img>` com o caminho relativo.
- **Autosave:** debounced + escrita atômica (mesmo padrão de CanvasView/PerfilModal na v1). Atualização otimista no cache do store (reflete na hora).
- Erros de save visíveis (banner não-bloqueante), como no resto do app.

## Arrastar imagem da nota → mapa

- O `<img>` na página é arrastável; `dragstart` seta `dataTransfer` com o MIME `application/x-grimorio-imagem` carregando o caminho relativo da imagem.
- O drop handler (fase capture) do `CanvasView`, que já trata `application/x-grimorio-personagem`, ganha um ramo para `application/x-grimorio-imagem`: cria uma imagem no canvas apontando para o **mesmo arquivo** do cofre (asset com `meta.rel` = o caminho relativo, `src` reconstruído por `convertFileSrc`). Nenhuma cópia de arquivo — a página e o mapa referenciam o mesmo arquivo.

## Componentes (limites de responsabilidade)

- **`notebookRepo`** (módulo próprio de dados, TDD com fakeFs): CRUD de páginas num caderno (pasta), montar árvore, reordenar/reparentar, ler/salvar página. Recebe a pasta-raiz do caderno + o `FsBridge`; reusa as primitivas de fs e o padrão de escrita serializada por caminho e tolerância a arquivo corrompido da v1. Módulo separado do `VaultRepo` para manter cada arquivo focado.
- **`PaginasRail.tsx`**: árvore de páginas (criar/renomear/excluir/aninhar/reordenar), destaca ativa.
- **`NotasEditor.tsx`**: editor TipTap da página ativa + toolbar + inserir imagem + autosave.
- **`Workspace.tsx`**: casca do split (Páginas | Notas | Mapa) com recolher/redimensionar/animação. Reusa `CanvasView` como painel de mapa. Também serve a escrita livre (sem mapa).
- **`CanvasView`**: adição pequena ao drop handler (MIME de imagem). Nada mais muda.
- **Store (zustand)**: página ativa por caderno, estado do split (proporção, recolhido), caderno aberto.

## Confiabilidade e erros

- Escrita atômica + serialização por caminho (reusa Rust/VaultRepo da v1).
- Página com JSON corrompido: aparece na árvore marcada com erro, não derruba o caderno (mesma filosofia da árvore do cofre v1).
- Imagem ausente: placeholder, sem crash.
- Autosave falho: banner visível; fechar/trocar de página faz flush do save pendente.

## Escopo

### v1 (desta parte)
- Split da sessão: Páginas + Notas + Mapa, recolhível/redimensionável/animado
- Escrita livre por campanha (caderno em tela cheia)
- Páginas aninhadas: criar, renomear, excluir, aninhar, reordenar
- Texto rico (títulos, negrito, itálico, listas, citação, divisória) + imagens
- Arrastar imagem da página para o mapa (sem cópia)
- Autosave atômico, caminhos de imagem portáveis

### Fora de escopo (backlog)
- Wiki-links `[[ ]]` (já adiado na v1)
- Mapa ao lado da escrita livre da campanha
- Editor de blocos estilo Notion (menu "/", arrastar blocos, callouts, toggles, colunas, tabelas)
- Backlinks, grafo de notas
- Busca global
- Export de notas em PDF

## Testes

- **Vitest** no `notebookRepo`: montar árvore a partir de `paiId`/`ordem`, criar/renomear/excluir, reordenar, reparentar, página corrompida vira item com erro, resolução de caminho de imagem, escrita serializada.
- **UI:** verificação manual no app rodando (split, recolher/animação, editor, inserir imagem, arrastar imagem para o mapa).

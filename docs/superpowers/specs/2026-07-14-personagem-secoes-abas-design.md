# Personagem com seções em abas — Design

**Data:** 2026-07-14
**Branch:** feature/grimorio-v1
**Status:** Aprovado (aguardando revisão do spec)

## Objetivo

Transformar o editor de personagem (`PerfilModal`), que hoje tem um único corpo
de texto livre, em um editor com 5 seções organizadas em **abas no topo**:

1. **Descrição** — texto rico
2. **História** — texto rico
3. **Imagens** — galeria em grade (para personagens com muitas imagens)
4. **Extras** — texto rico
5. **Anotações** — texto rico

Layout escolhido: abas no topo (só a aba ativa fica montada). Migração do conteúdo
atual (`corpo`) → seção **Descrição**.

## Estado atual (o que já existe)

- `PerfilModal.tsx`: modal com header (retrato/nome/resumo) + toolbar TipTap
  (StarterKit) + um único `EditorContent` ligado a `p.corpo`. Autosave debounced
  (800ms) via `agendarSalvar`, flush no unmount e no fechar.
- `types.ts`: `Personagem` tem `nome/retrato/resumo/corpo/criadoEm/modificadoEm`.
- `vaultRepo.ts`: `lerPersonagem` = `JSON.parse` puro; `salvarPersonagem` grava o
  objeto inteiro; `criarPersonagemEm` cria com `corpo: ''`; `copiarParaCofre` copia
  arquivo externo para dentro do cofre.
- `store.ts` (`carregarPersonagens`): todo personagem entra no cache via
  `repo.lerPersonagem` — **único ponto de entrada**, ideal para normalizar.
- `ImagemCofre.tsx`: extensão TipTap de imagem usada nas páginas/notas (imagem
  inline). Não será reusada na galeria (galeria é grade própria).
- Retrato: copiado para `<dir>/assets/retrato-<id>.<ext>` onde
  `dir = caminho.split('/').slice(0, 2).join('/')`. Exibido com
  `convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel))`.

## Modelo de dados (`types.ts`)

`corpo: string` é substituído por 4 campos de texto + 1 array de imagens:

```ts
export interface ImagemPersonagem {
  rel: string        // caminho relativo ao cofre (portável entre PCs)
  legenda?: string
}

export interface Personagem {
  id: string
  nome: string
  retrato: string | null
  resumo: string          // continua no header (aparece no cartão)
  descricao: string       // era `corpo` (HTML gerado pelo TipTap)
  historia: string        // HTML
  extras: string          // HTML
  anotacoes: string       // HTML
  imagens: ImagemPersonagem[]
  criadoEm: string
  modificadoEm: string
}
```

## Migração (automática, sem script)

Função pura `normalizarPersonagem(raw: unknown): Personagem` em `vaultRepo.ts`,
chamada dentro de `lerPersonagem`:

- `corpo` (se presente) → `descricao`
- Campos de texto faltando → `''`
- `imagens` faltando → `[]`
- Campos base (`id/nome/retrato/resumo/criadoEm/modificadoEm`) preservados
- **Não** grava `corpo` de volta (campo removido do modelo)

Comportamento:

- Arquivos antigos sobem de versão sozinhos quando o personagem é aberto e salvo
  (autosave grava o objeto inteiro já no formato novo). Nenhum comando manual.
- `montarArvore`/`listarItens` leem só `obj.nome` — compatível com formato antigo e
  novo, não quebra a sidebar.
- `criarPersonagemEm` passa a criar já no formato novo (campos de texto `''`,
  `imagens: []`).

## UI — abas (`PerfilModal.tsx`)

`PerfilModal` vira o shell:

- **Header** (retrato / nome / resumo): inalterado.
- **Barra de abas**: Descrição · História · Imagens · Extras · Anotações. Estado
  local `abaAtiva` (default `'descricao'`). Só a aba ativa é renderizada.
- **Abas de texto** (Descrição, História, Extras, Anotações): cada uma renderiza
  um `<EditorTexto value={p[campo]} onChange={(html) => agendarSalvar({ [campo]: html })} />`.
- **Aba Imagens**: renderiza `<GaleriaPersonagem personagemId={id} />`.

Autosave: o timer/`agendarSalvar`/`salvar`/flush ficam no nível do modal (como hoje).
Trocar de aba não perde dados — o último `onChange` já agendou o save e o timer é do
modal, não do editor. Fechar o modal faz flush.

Só 1 editor TipTap vivo por vez (a aba ativa). Ao voltar para uma aba, o editor
remonta lendo `p[campo]` do store (que tem os updates otimistas), então o conteúdo
persiste.

## `EditorTexto.tsx` (novo)

Editor de texto extraído do `PerfilModal` atual, reusado nas 4 abas de texto.

- Props: `{ value: string; onChange: (html: string) => void }`
- `useEditor({ extensions: [StarterKit], content: value, onUpdate: e => onChange(e.getHTML()) })`
- Toolbar B / I / H2 / H3 / • Lista / 1. Lista (usa `useEditorState`, igual ao atual)
- Sem imagem inline (StarterKit puro — mantém o comportamento atual do corpo)

## `GaleriaPersonagem.tsx` (novo)

Galeria em grade para a aba Imagens.

- Grade de miniaturas (`convertFileSrc` + `caminhoAbsolutoImagem`), fallback
  "imagem não encontrada" quando o arquivo não existe no cofre atual.
- Botão **+ Adicionar**: `open({ multiple: true, filters: [imagens] })`, copia cada
  arquivo para `<dir-do-personagem>/assets/galeria-<uuid>.<ext>` via `copiarParaCofre`,
  acrescenta `{ rel }` ao array. Reusa a mesma expressão de `dir` do retrato.
- Clicar miniatura → **lightbox** (overlay ampliando a imagem) com campo de legenda
  opcional (`textarea`), salvo em `imagens[i].legenda`.
- **Remover** (com confirmação `confirm(...)`): tira do array e apaga o arquivo do
  cofre (`removePath` via um método do repo). Evita arquivos órfãos.
- Alterações persistem via `agendarSalvar({ imagens })` (mesmo autosave do modal),
  passado por prop ou lido do store.

Helpers puros (testáveis sem IO), em `lib/`:

- `adicionarImagem(lista, rel): ImagemPersonagem[]` — acrescenta, dedupe por `rel`
- `removerImagem(lista, rel): ImagemPersonagem[]` — remove por `rel`

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `src/lib/types.ts` | `ImagemPersonagem`, campos novos em `Personagem`, remove `corpo` |
| `src/lib/vaultRepo.ts` | `normalizarPersonagem` + uso em `lerPersonagem`; `criarPersonagemEm` novo shape; método p/ apagar arquivo do cofre |
| `src/lib/imagemPersonagem.ts` (novo) | helpers puros `adicionarImagem`/`removerImagem` |
| `src/components/PerfilModal.tsx` | shell com abas; delega texto a `EditorTexto` e imagens a `GaleriaPersonagem` |
| `src/components/EditorTexto.tsx` (novo) | editor de texto extraído |
| `src/components/GaleriaPersonagem.tsx` (novo) | galeria em grade + lightbox |
| `src/theme.css` | estilos de abas / grade / lightbox |

## Testes (TDD, vitest)

- `normalizarPersonagem`: `corpo`→`descricao`; defaults para campos faltando;
  formato novo passa intocado; base fields preservados.
- `adicionarImagem` / `removerImagem`: add, remove por `rel`, dedupe.
- `criarPersonagemEm`: gera o shape novo (campos texto `''`, `imagens: []`).
- (Componentes com IO Tauri: cobrir a lógica pura; UI validada manualmente no app.)

## Fora de escopo (YAGNI)

- Reordenar imagens por drag-and-drop
- Imagens inline dentro das abas de texto
- Campo de versão de schema explícito (normalização por presença de campo basta)
- Migração destrutiva em massa (upgrade é lazy, ao abrir)

## Critérios de verificação

- Abrir personagem existente: conteúdo antigo aparece na aba **Descrição**; outras
  abas vazias; nenhum erro no console.
- Escrever em cada aba, trocar de aba, reabrir modal → conteúdo persistido por seção.
- Adicionar várias imagens → miniaturas na grade; reabrir → persistem.
- Remover imagem (confirmar) → some da grade e o arquivo sai do cofre.
- `npm test` verde; `tsc`/lint sem erros nos arquivos tocados.

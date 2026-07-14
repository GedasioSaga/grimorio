# Personagem com seções em abas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o editor de personagem (`PerfilModal`) de um corpo de texto único em um editor com 5 seções em abas: Descrição, História, Imagens (galeria em grade), Extras, Anotações.

**Architecture:** `Personagem.corpo` é substituído por 4 campos de texto (`descricao/historia/extras/anotacoes`) + `imagens: ImagemPersonagem[]`. Migração lazy: `normalizarPersonagem` no `vaultRepo.lerPersonagem` mapeia `corpo`→`descricao` ao ler (único ponto de entrada no store). O modal vira um shell com abas; o editor de texto é extraído para `EditorTexto` (reusado nas 4 abas de texto) e a galeria para `GaleriaPersonagem`. O autosave debounced continua no nível do modal.

**Tech Stack:** React + TypeScript, Zustand (`useApp`), TipTap v3 (`@tiptap/react` + StarterKit), Tauri (`@tauri-apps/plugin-dialog` `open`, `@tauri-apps/api/core` `convertFileSrc`), Vitest.

**Convenção de commit:** conventional commits em pt-BR, escopo `perfil` (ex.: `feat(perfil): ...`, `test(perfil): ...`, `refactor(perfil): ...`).

**Diretório de trabalho:** `grimorio/` (rodar `npm test` / `npm run build` a partir de `grimorio/`).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `grimorio/src/lib/types.ts` | `ImagemPersonagem` + novos campos em `Personagem` (remove `corpo`) |
| `grimorio/src/lib/imagemPersonagem.ts` (novo) | Helpers puros `adicionarImagem`/`removerImagem` |
| `grimorio/src/lib/vaultRepo.ts` | `normalizarPersonagem` (export), `lerPersonagem`, `criarPersonagemEm`, `removerArquivoCofre` |
| `grimorio/src/components/EditorTexto.tsx` (novo) | Editor TipTap + toolbar, extraído do PerfilModal (props `value`/`onChange`) |
| `grimorio/src/components/GaleriaPersonagem.tsx` (novo) | Galeria em grade + lightbox (add/remover/legenda) |
| `grimorio/src/components/PerfilModal.tsx` | Shell com abas; delega texto a `EditorTexto`, imagens a `GaleriaPersonagem` |
| `grimorio/src/theme.css` | Estilos de abas, grade, lightbox |
| `grimorio/src/test/imagemPersonagem.test.ts` (novo) | Testes dos helpers puros |
| `grimorio/src/test/normalizarPersonagem.test.ts` (novo) | Testes da migração/normalização |
| `grimorio/src/test/vaultRepo.test.ts` | +1 teste: `criarPersonagemEm` gera shape novo |

---

## Task 1: Helpers puros de imagem (`adicionarImagem` / `removerImagem`)

**Files:**
- Create: `grimorio/src/lib/imagemPersonagem.ts`
- Test: `grimorio/src/test/imagemPersonagem.test.ts`

Nota: `ImagemPersonagem` ainda não existe em `types.ts`. Este task define o tipo em `types.ts` (só o tipo novo; `Personagem` fica intocado até a Task 2, então a build continua verde).

- [ ] **Step 1: Adicionar o tipo `ImagemPersonagem` em `types.ts`**

No topo de `grimorio/src/lib/types.ts`, antes de `export interface Personagem`, inserir:

```ts
export interface ImagemPersonagem {
  rel: string        // caminho relativo ao cofre (portável entre PCs)
  legenda?: string
}
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `grimorio/src/test/imagemPersonagem.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adicionarImagem, removerImagem } from '../lib/imagemPersonagem'

describe('imagemPersonagem', () => {
  it('adiciona uma imagem nova ao fim da lista', () => {
    expect(adicionarImagem([], 'a/x.png')).toEqual([{ rel: 'a/x.png' }])
  })

  it('não duplica imagem com o mesmo rel', () => {
    const lista = [{ rel: 'a/x.png' }]
    expect(adicionarImagem(lista, 'a/x.png')).toBe(lista) // mesma referência: no-op
  })

  it('remove imagem por rel', () => {
    const lista = [{ rel: 'a/x.png' }, { rel: 'a/y.png' }]
    expect(removerImagem(lista, 'a/x.png')).toEqual([{ rel: 'a/y.png' }])
  })

  it('remover rel inexistente devolve lista equivalente', () => {
    const lista = [{ rel: 'a/x.png' }]
    expect(removerImagem(lista, 'nao/existe.png')).toEqual([{ rel: 'a/x.png' }])
  })

  it('preserva legenda existente ao remover outra imagem', () => {
    const lista = [{ rel: 'a/x.png', legenda: 'oi' }, { rel: 'a/y.png' }]
    expect(removerImagem(lista, 'a/y.png')).toEqual([{ rel: 'a/x.png', legenda: 'oi' }])
  })
})
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd grimorio && npx vitest run src/test/imagemPersonagem.test.ts`
Expected: FAIL — `Failed to resolve import '../lib/imagemPersonagem'`.

- [ ] **Step 4: Implementar o mínimo**

Criar `grimorio/src/lib/imagemPersonagem.ts`:

```ts
import type { ImagemPersonagem } from './types'

/** Acrescenta uma imagem à lista. Dedupe por `rel` (no-op se já existir). */
export function adicionarImagem(lista: ImagemPersonagem[], rel: string): ImagemPersonagem[] {
  if (lista.some((i) => i.rel === rel)) return lista
  return [...lista, { rel }]
}

/** Remove a imagem de `rel` da lista. */
export function removerImagem(lista: ImagemPersonagem[], rel: string): ImagemPersonagem[] {
  return lista.filter((i) => i.rel !== rel)
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd grimorio && npx vitest run src/test/imagemPersonagem.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add grimorio/src/lib/types.ts grimorio/src/lib/imagemPersonagem.ts grimorio/src/test/imagemPersonagem.test.ts
git commit -m "feat(perfil): helpers puros adicionarImagem/removerImagem (TDD)"
```

---

## Task 2: Modelo de dados + migração no repo

**Files:**
- Modify: `grimorio/src/lib/types.ts` (interface `Personagem`)
- Modify: `grimorio/src/lib/vaultRepo.ts` (`normalizarPersonagem`, `lerPersonagem`, `criarPersonagemEm`, `removerArquivoCofre`)
- Modify: `grimorio/src/components/PerfilModal.tsx` (fix mínimo `corpo`→`descricao`, linhas 23 e 25)
- Test: `grimorio/src/test/normalizarPersonagem.test.ts` (novo), `grimorio/src/test/vaultRepo.test.ts`

- [ ] **Step 1: Trocar `corpo` pelos campos novos em `Personagem`**

Em `grimorio/src/lib/types.ts`, substituir a interface `Personagem` (a atual tem `corpo: string`) por:

```ts
export interface Personagem {
  id: string
  nome: string
  retrato: string | null // caminho relativo ao cofre, ex.: "campanhas/x/assets/foo.png"
  resumo: string
  descricao: string // HTML gerado pelo TipTap (era `corpo`)
  historia: string  // HTML
  extras: string    // HTML
  anotacoes: string // HTML
  imagens: ImagemPersonagem[]
  criadoEm: string // ISO-8601
  modificadoEm: string
}
```

- [ ] **Step 2: Escrever o teste de normalização que falha**

Criar `grimorio/src/test/normalizarPersonagem.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizarPersonagem } from '../lib/vaultRepo'

describe('normalizarPersonagem', () => {
  it('migra `corpo` legado para `descricao`', () => {
    const p = normalizarPersonagem({
      id: '1', nome: 'Baldur', retrato: null, resumo: 'r',
      corpo: '<p>história antiga</p>',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    })
    expect(p.descricao).toBe('<p>história antiga</p>')
    expect('corpo' in p).toBe(false)
  })

  it('preenche campos faltando com vazios', () => {
    const p = normalizarPersonagem({ id: '1', nome: 'X' })
    expect(p.descricao).toBe('')
    expect(p.historia).toBe('')
    expect(p.extras).toBe('')
    expect(p.anotacoes).toBe('')
    expect(p.imagens).toEqual([])
  })

  it('preserva o formato novo intocado', () => {
    const novo = {
      id: '1', nome: 'X', retrato: null, resumo: 'r',
      descricao: '<p>d</p>', historia: '<p>h</p>', extras: '<p>e</p>', anotacoes: '<p>a</p>',
      imagens: [{ rel: 'a/x.png', legenda: 'oi' }],
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-02T00:00:00.000Z',
    }
    expect(normalizarPersonagem(novo)).toEqual(novo)
  })

  it('descricao explícita tem prioridade sobre corpo legado', () => {
    const p = normalizarPersonagem({ id: '1', nome: 'X', descricao: '<p>nova</p>', corpo: '<p>velha</p>' })
    expect(p.descricao).toBe('<p>nova</p>')
  })

  it('preserva id e datas base', () => {
    const p = normalizarPersonagem({
      id: 'abc', nome: 'X',
      criadoEm: '2019-05-05T00:00:00.000Z', modificadoEm: '2019-06-06T00:00:00.000Z',
    })
    expect(p.id).toBe('abc')
    expect(p.criadoEm).toBe('2019-05-05T00:00:00.000Z')
    expect(p.modificadoEm).toBe('2019-06-06T00:00:00.000Z')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd grimorio && npx vitest run src/test/normalizarPersonagem.test.ts`
Expected: FAIL — `normalizarPersonagem` não é exportado por `vaultRepo`.

- [ ] **Step 4: Implementar `normalizarPersonagem` + usar em `lerPersonagem`**

Em `grimorio/src/lib/vaultRepo.ts`:

(a) Importar `ImagemPersonagem` no import de tipos existente (linha 2). O import atual é:
```ts
import type { Campanha, CampanhaNode, CanvasDoc, ItemRef, PastaNode, Personagem, VaultTree } from './types'
```
Trocar por:
```ts
import type { Campanha, CampanhaNode, CanvasDoc, ImagemPersonagem, ItemRef, PastaNode, Personagem, VaultTree } from './types'
```

(b) Logo após as funções `agora()` e `novoId()` (antes de `export class VaultRepo`), adicionar a função pura exportada:

```ts
/**
 * Normaliza um personagem lido do disco para o formato atual.
 * Migração lazy: `corpo` legado vira `descricao`; campos faltando ganham vazios.
 */
export function normalizarPersonagem(
  raw: Partial<Personagem> & { corpo?: string },
): Personagem {
  return {
    id: raw.id ?? novoId(),
    nome: raw.nome ?? '',
    retrato: raw.retrato ?? null,
    resumo: raw.resumo ?? '',
    descricao: raw.descricao ?? raw.corpo ?? '',
    historia: raw.historia ?? '',
    extras: raw.extras ?? '',
    anotacoes: raw.anotacoes ?? '',
    imagens: raw.imagens ?? [],
    criadoEm: raw.criadoEm ?? agora(),
    modificadoEm: raw.modificadoEm ?? agora(),
  }
}
```

(c) Trocar `lerPersonagem` (atualmente `return JSON.parse(await this.fs.readText(this.abs(caminho)))`) por:

```ts
  async lerPersonagem(caminho: string): Promise<Personagem> {
    return normalizarPersonagem(JSON.parse(await this.fs.readText(this.abs(caminho))))
  }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd grimorio && npx vitest run src/test/normalizarPersonagem.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Atualizar `criarPersonagemEm` para o shape novo + teste**

Em `grimorio/src/lib/vaultRepo.ts`, dentro de `criarPersonagemEm`, trocar o objeto:
```ts
    const p: Personagem = {
      id: novoId(), nome, retrato: null, resumo: '', corpo: '',
      criadoEm: agora(), modificadoEm: agora(),
    }
```
por:
```ts
    const p: Personagem = {
      id: novoId(), nome, retrato: null, resumo: '',
      descricao: '', historia: '', extras: '', anotacoes: '', imagens: [],
      criadoEm: agora(), modificadoEm: agora(),
    }
```

Adicionar em `grimorio/src/test/vaultRepo.test.ts`, dentro do bloco `describe('VaultRepo', ...)` (ex.: após o teste `'cria personagem e lê de volta'`):

```ts
  it('cria personagem já no formato de seções (sem corpo)', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    expect(p.descricao).toBe('')
    expect(p.historia).toBe('')
    expect(p.extras).toBe('')
    expect(p.anotacoes).toBe('')
    expect(p.imagens).toEqual([])
    expect((p as unknown as { corpo?: string }).corpo).toBeUndefined()
  })
```

- [ ] **Step 7: Adicionar `removerArquivoCofre` no repo**

Em `grimorio/src/lib/vaultRepo.ts`, logo após `copiarParaCofre` (que hoje termina na linha ~156), adicionar:

```ts
  /** Apaga um arquivo do cofre por caminho relativo (ex.: imagem removida da galeria). */
  async removerArquivoCofre(rel: string): Promise<void> {
    await this.fs.removePath(this.abs(rel))
  }
```

Adicionar teste em `grimorio/src/test/vaultRepo.test.ts` (após `'copia arquivo externo para dentro do cofre'`):

```ts
  it('remove arquivo do cofre por caminho relativo', async () => {
    await repo.inicializar()
    fs.arquivos.set('C:/Downloads/foto.png', '<bin>')
    await repo.copiarParaCofre('C:/Downloads/foto.png', 'campanhas/teste/assets/galeria-1.png')
    expect(await fs.exists('C:/Cofre/campanhas/teste/assets/galeria-1.png')).toBe(true)
    await repo.removerArquivoCofre('campanhas/teste/assets/galeria-1.png')
    expect(await fs.exists('C:/Cofre/campanhas/teste/assets/galeria-1.png')).toBe(false)
  })
```

- [ ] **Step 8: Fix mínimo no `PerfilModal` (`corpo`→`descricao`) para manter a build verde**

Em `grimorio/src/components/PerfilModal.tsx`:
- Linha 23: `content: p?.corpo ?? '',` → `content: p?.descricao ?? '',`
- Linha 25: `agendarSalvar({ corpo: editor.getHTML() })` → `agendarSalvar({ descricao: editor.getHTML() })`

(O editor único continua funcionando, agora ligado a `descricao`. As abas entram nas Tasks 3–5.)

- [ ] **Step 9: Rodar a suíte inteira + typecheck**

Run: `cd grimorio && npx vitest run && npm run build`
Expected: todos os testes PASS; `tsc` sem erros.

- [ ] **Step 10: Commit**

```bash
git add grimorio/src/lib/types.ts grimorio/src/lib/vaultRepo.ts grimorio/src/components/PerfilModal.tsx grimorio/src/test/normalizarPersonagem.test.ts grimorio/src/test/vaultRepo.test.ts
git commit -m "feat(perfil): modelo de seções + migração lazy corpo->descricao (TDD)"
```

---

## Task 3: Extrair `EditorTexto` e usar no `PerfilModal`

Refatoração sem mudança de comportamento visível: o editor único continua, mas o TipTap+toolbar saem para um componente reusável.

**Files:**
- Create: `grimorio/src/components/EditorTexto.tsx`
- Modify: `grimorio/src/components/PerfilModal.tsx`

- [ ] **Step 1: Criar `EditorTexto.tsx`**

Criar `grimorio/src/components/EditorTexto.tsx`:

```tsx
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

/**
 * Editor de texto rico (StarterKit) com toolbar B/I/H2/H3/lista.
 * Controlado por HTML: `value` é o conteúdo inicial da montagem; cada edição
 * emite `onChange(html)`. Trocar de aba deve desmontar/remontar (use `key`)
 * para reinicializar o conteúdo a partir do campo certo.
 */
export function EditorTexto({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
  })

  // TipTap v3 não re-renderiza a cada transação; useEditorState observa a toolbar
  const ativo = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
    }),
  })

  if (!editor) return null

  return (
    <>
      <div className="perfil-toolbar">
        <button className={ativo.bold ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button className={ativo.italic ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button className={ativo.h2 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className={ativo.h3 ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        <button className={ativo.bulletList ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()}>• Lista</button>
        <button className={ativo.orderedList ? 'ativo' : ''} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. Lista</button>
      </div>
      <EditorContent editor={editor} className="perfil-corpo" />
    </>
  )
}
```

- [ ] **Step 2: Usar `EditorTexto` no `PerfilModal` (editor único, comportamento idêntico)**

Em `grimorio/src/components/PerfilModal.tsx`:

(a) Remover imports agora desnecessários (linhas 2–3):
```ts
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
```
Adicionar:
```ts
import { EditorTexto } from './EditorTexto'
```

(b) Remover o bloco `const editor = useEditor({...})` (linhas 21–27) e o bloco `const ativo = useEditorState({...})` (linhas 30–40).

(c) Trocar a `<div className="perfil-toolbar">…</div>` (linhas 145–152) e a `<EditorContent editor={editor} className="perfil-corpo" />` (linha 153) por:
```tsx
        <EditorTexto value={p.descricao} onChange={(html) => agendarSalvar({ descricao: html })} />
```

(O header, o autosave (`agendarSalvar`/`salvar`/`timer`), o flush no unmount, `trocarRetrato` e o banner de erro ficam inalterados.)

- [ ] **Step 3: Rodar testes + build**

Run: `cd grimorio && npx vitest run && npm run build`
Expected: PASS; `tsc` sem erros; nenhum import não usado em `PerfilModal.tsx`.

- [ ] **Step 4: Verificação manual rápida**

Run: `cd grimorio && npm run tauri dev` (ou o app já aberto). Abrir um personagem, digitar no editor, fechar e reabrir → texto persiste na Descrição. Toolbar B/I/H2/H3/listas funcionam.

- [ ] **Step 5: Commit**

```bash
git add grimorio/src/components/EditorTexto.tsx grimorio/src/components/PerfilModal.tsx
git commit -m "refactor(perfil): extrai EditorTexto do PerfilModal"
```

---

## Task 4: Componente `GaleriaPersonagem`

Componente da aba Imagens. Ainda **não** é montado em lugar nenhum (isso é a Task 5), então a build fica verde com um export novo não usado.

**Files:**
- Create: `grimorio/src/components/GaleriaPersonagem.tsx`
- Modify: `grimorio/src/theme.css` (estilos da galeria/lightbox)

- [ ] **Step 1: Criar `GaleriaPersonagem.tsx`**

Criar `grimorio/src/components/GaleriaPersonagem.tsx`:

```tsx
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { adicionarImagem, removerImagem } from '../lib/imagemPersonagem'
import type { ImagemPersonagem } from '../lib/types'

/**
 * Galeria em grade da aba Imagens. Copia arquivos escolhidos para
 * `<dir-do-personagem>/assets/` (mesmo padrão do retrato) e guarda só `rel`.
 * A persistência é do pai (via `onImagensChange` → autosave do modal).
 */
export function GaleriaPersonagem({
  personagemId,
  imagens,
  onImagensChange,
}: {
  personagemId: string
  imagens: ImagemPersonagem[]
  onImagensChange: (novo: ImagemPersonagem[]) => void
}) {
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const caminhoPorId = useApp((s) => s.caminhoPorId)
  const [ampliadaRel, setAmpliadaRel] = useState<string | null>(null)

  const ampliada = imagens.find((i) => i.rel === ampliadaRel) ?? null

  async function adicionar() {
    const caminho = caminhoPorId[personagemId]
    if (!repo || !caminho) return
    // assets/ da mesma pasta do personagem (igual ao retrato)
    const dirAssets = `${caminho.split('/').slice(0, 2).join('/')}/assets`
    try {
      const escolha = await open({
        title: 'Escolher imagens',
        multiple: true,
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      const arquivos = Array.isArray(escolha) ? escolha : escolha ? [escolha] : []
      let lista = imagens
      for (const arquivo of arquivos) {
        const nomeArquivo = arquivo.split(/[\\/]/).pop() ?? ''
        const ext = (nomeArquivo.includes('.') ? nomeArquivo.split('.').pop()! : 'png').toLowerCase()
        const destinoRel = `${dirAssets}/galeria-${crypto.randomUUID()}.${ext}`
        await repo.copiarParaCofre(arquivo, destinoRel)
        lista = adicionarImagem(lista, destinoRel)
      }
      if (lista !== imagens) onImagensChange(lista)
    } catch (e) {
      alert(`Falha ao adicionar imagens: ${e}`)
    }
  }

  async function remover(rel: string) {
    if (!confirm('Remover esta imagem do personagem?')) return
    onImagensChange(removerImagem(imagens, rel))
    setAmpliadaRel(null)
    try {
      await repo?.removerArquivoCofre(rel)
    } catch (e) {
      console.error('Falha ao apagar arquivo da galeria:', e)
    }
  }

  function editarLegenda(rel: string, legenda: string) {
    onImagensChange(imagens.map((i) => (i.rel === rel ? { ...i, legenda: legenda || undefined } : i)))
  }

  const src = (rel: string) => (vaultPath ? convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)) : '')

  return (
    <div className="galeria">
      <div className="galeria-topo">
        <button onClick={() => void adicionar()}>+ Adicionar</button>
      </div>
      {imagens.length === 0 ? (
        <p className="galeria-vazia">Nenhuma imagem ainda. Clique em “+ Adicionar”.</p>
      ) : (
        <div className="galeria-grade">
          {imagens.map((img) => (
            <button key={img.rel} className="galeria-item" onClick={() => setAmpliadaRel(img.rel)} title={img.legenda ?? ''}>
              <img src={src(img.rel)} alt={img.legenda ?? ''} onError={(e) => { (e.currentTarget.style.visibility = 'hidden') }} />
            </button>
          ))}
        </div>
      )}

      {ampliada && (
        <div className="galeria-lightbox" onClick={() => setAmpliadaRel(null)}>
          <div className="galeria-lightbox-conteudo" onClick={(e) => e.stopPropagation()}>
            <img src={src(ampliada.rel)} alt={ampliada.legenda ?? ''} />
            <textarea
              className="galeria-legenda"
              placeholder="Legenda (opcional)…"
              value={ampliada.legenda ?? ''}
              onChange={(e) => editarLegenda(ampliada.rel, e.target.value)}
            />
            <div className="galeria-lightbox-acoes">
              <button onClick={() => void remover(ampliada.rel)}>Remover</button>
              <button onClick={() => setAmpliadaRel(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Adicionar estilos no `theme.css`**

Ao final de `grimorio/src/theme.css`, adicionar:

```css
/* ---- galeria de personagem ---- */
.galeria { flex: 1; overflow-y: auto; padding: 16px 20px; }
.galeria-topo { margin-bottom: 12px; }
.galeria-vazia { color: var(--texto-fraco); font-size: 13px; }
.galeria-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.galeria-item { padding: 0; border: 1px solid var(--borda); border-radius: 4px; overflow: hidden; aspect-ratio: 1; cursor: pointer; background: var(--fundo); }
.galeria-item:hover { border-color: var(--dourado); }
.galeria-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.galeria-lightbox { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 1100; }
.galeria-lightbox-conteudo { display: flex; flex-direction: column; gap: 10px; max-width: 80vw; max-height: 85vh; }
.galeria-lightbox-conteudo img { max-width: 80vw; max-height: 65vh; object-fit: contain; border-radius: 6px; border: 1px solid var(--borda); }
.galeria-legenda { background: var(--fundo-elevado); border: 1px solid var(--borda); border-radius: 4px; color: var(--texto); padding: 6px 8px; resize: vertical; min-height: 40px; font-family: inherit; }
.galeria-lightbox-acoes { display: flex; gap: 8px; justify-content: flex-end; }
```

- [ ] **Step 3: Rodar testes + build**

Run: `cd grimorio && npx vitest run && npm run build`
Expected: PASS; `tsc` sem erros (o componente compila mesmo sem estar montado ainda).

- [ ] **Step 4: Commit**

```bash
git add grimorio/src/components/GaleriaPersonagem.tsx grimorio/src/theme.css
git commit -m "feat(perfil): componente GaleriaPersonagem (grade + lightbox)"
```

---

## Task 5: `PerfilModal` com abas

Amarra tudo: barra de abas + editor por aba de texto + galeria na aba Imagens.

**Files:**
- Modify: `grimorio/src/components/PerfilModal.tsx`
- Modify: `grimorio/src/theme.css` (estilos das abas)

- [ ] **Step 1: Adicionar import da galeria e o tipo/lista de abas**

Em `grimorio/src/components/PerfilModal.tsx`:

(a) Adicionar import:
```ts
import { GaleriaPersonagem } from './GaleriaPersonagem'
```

(b) Antes do `export function PerfilModal(...)`, definir:
```ts
type Aba = 'descricao' | 'historia' | 'imagens' | 'extras' | 'anotacoes'
type AbaTexto = Exclude<Aba, 'imagens'>

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'descricao', rotulo: 'Descrição' },
  { id: 'historia', rotulo: 'História' },
  { id: 'imagens', rotulo: 'Imagens' },
  { id: 'extras', rotulo: 'Extras' },
  { id: 'anotacoes', rotulo: 'Anotações' },
]
```

- [ ] **Step 2: Estado da aba ativa**

Dentro do componente, junto aos outros `useState` (ex.: perto de `const [salvarErro, setSalvarErro] = useState<string | null>(null)`), adicionar:
```ts
  const [aba, setAba] = useState<Aba>('descricao')
```

- [ ] **Step 3: Renderizar barra de abas + conteúdo da aba ativa**

Substituir a linha do editor único adicionada na Task 3:
```tsx
        <EditorTexto value={p.descricao} onChange={(html) => agendarSalvar({ descricao: html })} />
```
por:
```tsx
        <div className="perfil-abas">
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => setAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </div>
        {aba === 'imagens' ? (
          <GaleriaPersonagem
            personagemId={personagemId}
            imagens={p.imagens}
            onImagensChange={(imagens) => agendarSalvar({ imagens })}
          />
        ) : (
          <EditorTexto
            key={aba}
            value={p[aba as AbaTexto]}
            onChange={(html) => agendarSalvar({ [aba]: html } as Partial<Personagem>)}
          />
        )}
```

Notas:
- `key={aba}` força remontar o `EditorTexto` ao trocar de aba, reinicializando o conteúdo a partir do campo certo (`p[aba]`).
- No ramo `else`, `aba` já está estreitado para `AbaTexto` (união sem `'imagens'`); o `as AbaTexto` é defensivo. O `as Partial<Personagem>` é necessário porque a chave computada `{ [aba]: html }` tem tipo de índice largo.
- O autosave é o mesmo (`agendarSalvar`), o timer é do modal, então trocar de aba não perde nada; fechar faz flush (efeito de unmount existente).

- [ ] **Step 4: Estilos das abas no `theme.css`**

No `grimorio/src/theme.css`, após `.perfil-toolbar button.ativo { ... }` (linha ~161), adicionar:
```css
.perfil-abas { display: flex; gap: 2px; padding: 8px 20px 0; border-bottom: 1px solid var(--borda); }
.perfil-abas button { border: none; border-bottom: 2px solid transparent; border-radius: 0; padding: 6px 12px; color: var(--texto-fraco); background: transparent; }
.perfil-abas button:hover { color: var(--texto); }
.perfil-abas button.ativo { color: var(--dourado-claro); border-bottom-color: var(--dourado); }
```

- [ ] **Step 5: Rodar testes + build**

Run: `cd grimorio && npx vitest run && npm run build`
Expected: PASS; `tsc` sem erros.

- [ ] **Step 6: Verificação manual (app)**

Abrir um personagem:
- 5 abas aparecem; Descrição ativa por padrão; conteúdo antigo aparece na Descrição.
- Escrever em cada aba de texto, alternar abas, reabrir modal → cada seção persiste separada.
- Aba Imagens → “+ Adicionar”, escolher várias → miniaturas na grade; reabrir → persistem.
- Clicar miniatura → lightbox; editar legenda; “Remover” (confirmar) → some da grade e o arquivo sai do cofre (conferir a pasta `assets/`).

- [ ] **Step 7: Commit**

```bash
git add grimorio/src/components/PerfilModal.tsx grimorio/src/theme.css
git commit -m "feat(perfil): editor de personagem com 5 seções em abas"
```

---

## Task 6: Verificação final

**Files:** nenhum (só validação)

- [ ] **Step 1: Suíte completa + build**

Run: `cd grimorio && npx vitest run && npm run build`
Expected: todos os testes PASS; `tsc` limpo.

- [ ] **Step 2: Lint (se houver script)**

Run: `cd grimorio && npm run lint`
Expected: sem erros nos arquivos tocados (imports não usados, etc.). Se não existir script `lint`, pular.

- [ ] **Step 3: Checklist de verificação manual (do spec)**

- Personagem existente: conteúdo antigo na aba Descrição; outras vazias; console sem erro.
- Persistência por seção ao alternar abas e reabrir.
- Adicionar várias imagens → grade; reabrir → persistem.
- Remover imagem (confirmar) → some da grade e o arquivo sai do cofre.

- [ ] **Step 4: Revisão limpa (opcional, recomendado)**

Sugerir ao usuário abrir sessão nova (`/clear`) e pedir review com contexto limpo (padrão Writer/Reviewer), listando os arquivos tocados e as áreas de risco (migração `corpo`→`descricao`, IO de arquivos da galeria).

---

## Self-Review (feito pelo autor do plano)

**Cobertura do spec:**
- Modelo de dados (§Modelo) → Task 2 Step 1.
- Migração lazy `corpo`→`descricao` (§Migração) → Task 2 Steps 2–5.
- `criarPersonagemEm` novo shape (§Migração) → Task 2 Step 6.
- UI em abas (§UI) → Task 5.
- `EditorTexto` extraído (§EditorTexto) → Task 3.
- Galeria + lightbox + add/remover/legenda (§Galeria) → Task 4 + Task 5 (montagem).
- Helpers puros (§Galeria) → Task 1.
- `removerArquivoCofre` (§Galeria) → Task 2 Step 7.
- CSS (§Arquivos) → Tasks 4–5.
- Testes (§Testes) → Tasks 1, 2.

**Consistência de tipos:** `ImagemPersonagem { rel; legenda? }`, `Personagem.imagens`, `normalizarPersonagem`, `adicionarImagem`/`removerImagem`, `removerArquivoCofre`, props `GaleriaPersonagem { personagemId, imagens, onImagensChange }`, `EditorTexto { value, onChange }` — usados de forma idêntica entre as tasks.

**Sem placeholders:** todo step tem código/comando concreto.

**Ordem de build verde:** cada commit compila. A troca de tipo (Task 2) vem junto do fix mínimo do `PerfilModal` (Step 8), evitando janela de build quebrada.

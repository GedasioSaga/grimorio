# IA rica nos modais (por aba) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu ✨ dos modais (Personagem/Cenário) passa a operar na aba aberta: gerar versão curta/longa, melhorar o texto, e perguntar livremente (dicas) — com preview de Substituir/Adicionar/Descartar.

**Architecture:** Prompts em lib pura testada; `AcoesIA` ganha ações tab-aware + input de pergunta + preview com 3 modos; os modais passam a aba atual e tratam `modo` (substituir vs adicionar). Reusa toda a fundação IA (Gemini, contexto, persona).

**Tech Stack:** React 19, zustand, vitest. Reusa `gerarConteudo`, `montarContexto`, `htmlParaTexto`/`textoParaHtml`, `mimeDaImagem`/`uint8ParaBase64`.

**Spec:** `docs/superpowers/specs/2026-07-16-ia-modais-rica-design.md`

---

## Contexto verificado (ler antes de começar)

- `src/components/AcoesIA.tsx` (atual): props `entidadeTipo, entidadeId, acoes, onInserir(aba,html)`; menu de botões fixos; `montarContexto()`; `rodar(acao)`; preview com "Inserir". Guarda `montadoRef`, clique-fora, erro visível — MANTER esses padrões.
- `src/components/PerfilModal.tsx:26-39` — `ACOES_IA_PERSONAGEM` (2 ações); `:153-163` — `<AcoesIA>` no header, `onInserir` faz `base + html` e `setAba`. `type Aba = 'descricao'|'informacao'|'historia'|'imagens'|'extras'|'anotacoes'|'vinculos'`; `type AbaTexto = Exclude<Aba,'imagens'|'vinculos'>`; `ABAS` (id+rotulo). Não-texto: `imagens`, `vinculos`.
- `src/components/CenarioModal.tsx:30-50` — `ACOES_IA_CENARIO` (3 ações, uma `comImagem`); `:160-...` — `<AcoesIA>`. `type Aba` inclui `conteudo` e `imagens` (não-texto); `AbaTexto = Exclude<Aba,'imagens'|'conteudo'|'vinculos'>`. (Confirmar o `vinculos` no Exclude — o modal tem aba Vínculos.)
- `src/lib/htmlTexto.ts` — `htmlParaTexto`, `textoParaHtml`.
- Suíte hoje: **212 passed**; erro "unhandled" pré-existente em `imagemViewRepro.test.tsx` (jsdom) ignorável. Rodar de `grimorio/`.

**Atenção:** AcoesIA é montado em ambos os modais; a aba "Vínculos" (adicionada antes) NÃO é de texto do modelo — tratar como não-texto (sem curta/longa/melhorar).

---

## Task 1: Prompts (puro)

**Files:**
- Create: `src/lib/promptsIA.ts`
- Test: `src/test/promptsIA.test.ts`

- [ ] **Step 1: Write the failing test**

`src/test/promptsIA.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { promptMelhorar, promptVersao } from '../lib/promptsIA'

describe('promptVersao', () => {
  it('curta menciona a aba e o formato curto', () => {
    const p = promptVersao('História', 'curta')
    expect(p).toContain('"História"')
    expect(p).toMatch(/CURTA/)
  })
  it('longa menciona parágrafos', () => {
    expect(promptVersao('Descrição', 'longa')).toMatch(/LONGA|parágrafos/)
  })
  it('pede só o texto, sem título/preâmbulo', () => {
    expect(promptVersao('Eventos', 'curta')).toMatch(/sem título/i)
  })
})

describe('promptMelhorar', () => {
  it('menciona a aba e manter os fatos', () => {
    const p = promptMelhorar('Eventos')
    expect(p).toContain('"Eventos"')
    expect(p).toMatch(/fatos|mantend/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- promptsIA`
Expected: FAIL — `Cannot find module '../lib/promptsIA'`.

- [ ] **Step 3: Implement `src/lib/promptsIA.ts`**

```ts
/** Instruções de IA para as ações tab-aware dos modais (a entidade + contexto entram à parte). */

/** Gera o conteúdo de uma seção, curto (1-2 frases) ou longo (3-4 parágrafos). */
export function promptVersao(rotuloAba: string, tamanho: 'curta' | 'longa'): string {
  const formato =
    tamanho === 'curta'
      ? 'versão CURTA: 1-2 frases, direta e evocativa'
      : 'versão LONGA: 3-4 parágrafos, rica em detalhes'
  return (
    `Escreva o conteúdo da seção "${rotuloAba}" desta entidade — ${formato}. ` +
    `Coerente com os dados da entidade e o contexto da campanha. ` +
    `Responda só com o texto da seção, sem título nem preâmbulo.`
  )
}

/** Melhora o texto atual de uma seção, mantendo sentido e fatos. */
export function promptMelhorar(rotuloAba: string): string {
  return (
    `Melhore o texto atual da seção "${rotuloAba}": corrija, enriqueça e clarifique, ` +
    `mantendo o sentido e os fatos (não invente contradições). ` +
    `Responda só com o texto revisado, sem título nem preâmbulo.`
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- promptsIA`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/promptsIA.ts src/test/promptsIA.test.ts
git commit -m "feat(ia): prompts de versao curta/longa e melhorar"
```

---

## Task 2: AcoesIA tab-aware + Perguntar + preview 3 modos

**Files:**
- Modify: `src/components/AcoesIA.tsx`

- [ ] **Step 1: Reescrever o componente**

Substituir o conteúdo de `AcoesIA.tsx` por (mantém imports atuais + adiciona `promptMelhorar`/`promptVersao`):

```tsx
import { useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { gerarConteudo, type ImagemIA } from '../lib/gemini'
import { SYSTEM_MESTRE } from '../lib/chatIA'
import {
  achatarCenarios,
  campanhaDeEntidade,
  frasesDeVinculosNoEscopo,
  montarContextoCampanha,
} from '../lib/contextoIA'
import { filtrarArvoreCenarios } from '../lib/filtroCampanha'
import { idsDaCampanha } from '../lib/vinculos'
import { htmlParaTexto, textoParaHtml } from '../lib/htmlTexto'
import { mimeDaImagem, uint8ParaBase64 } from '../lib/bin'
import { promptMelhorar, promptVersao } from '../lib/promptsIA'

export interface AcaoIA {
  rotulo: string
  prompt: string
  abaDestino: string
  rotuloDestino?: string
  comImagem?: boolean
}

interface Preview {
  rotulo: string
  destino: string
  rotuloDestino: string
  texto: string
}

type ModoInserir = 'substituir' | 'adicionar'

/**
 * Menu ✨ dos modais: ações tab-aware (versão curta/longa/melhorar na aba aberta),
 * pergunta livre, e ações específicas (via `acoes`). Preview antes de gravar; nada
 * é escrito sem clicar Substituir/Adicionar.
 */
export function AcoesIA({
  entidadeTipo,
  entidadeId,
  abaAtual,
  rotuloAbaAtual,
  abaEhTexto,
  acoes,
  onInserir,
}: {
  entidadeTipo: 'personagem' | 'cenario'
  entidadeId: string
  abaAtual: string
  rotuloAbaAtual: string
  abaEhTexto: boolean
  acoes: AcaoIA[]
  onInserir: (aba: string, html: string, modo: ModoInserir) => void
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pergunta, setPergunta] = useState('')
  const raizRef = useRef<HTMLDivElement | null>(null)
  const montadoRef = useRef(true)

  useEffect(() => () => {
    montadoRef.current = false
  }, [])

  useEffect(() => {
    if (!menuAberto) return
    function aoClicarFora(e: MouseEvent) {
      if (!raizRef.current?.contains(e.target as Node)) setMenuAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [menuAberto])

  /** Contexto: campanha da entidade (vínculo participa ou pasta) + vínculos no escopo. */
  function montarContexto(): string {
    const { tree, personagens, cenarios, vinculos, caminhoPorId } = useApp.getState()
    const camp = tree ? campanhaDeEntidade(tree, vinculos, (id) => caminhoPorId[id], entidadeId) : null
    if (!camp || !tree) return ''
    const ids = idsDaCampanha(vinculos, camp.id)
    const parts = Object.values(personagens).filter((p) => ids.has(p.id)).map((p) => ({ nome: p.nome, resumo: p.resumo }))
    const linhasCen = achatarCenarios(filtrarArvoreCenarios(tree.cenarios, ids), (id) => cenarios[id]?.resumo ?? '')
    const nomeDe = (id: string) => personagens[id]?.nome ?? cenarios[id]?.nome ?? null
    return montarContextoCampanha({
      nomeCampanha: camp.nome,
      personagens: parts,
      cenarios: linhasCen,
      vinculos: frasesDeVinculosNoEscopo(vinculos, ids, nomeDe),
      notas: '',
    })
  }

  async function executar(opts: {
    rotulo: string
    destino: string
    rotuloDestino: string
    prompt: string
    comImagem?: boolean
  }) {
    setMenuAberto(false)
    setErro(null)
    setRodando(true)
    try {
      const { personagens, cenarios, vaultPath } = useApp.getState()
      const ent = entidadeTipo === 'personagem' ? personagens[entidadeId] : cenarios[entidadeId]
      if (!ent) {
        if (montadoRef.current) setErro('Entidade não encontrada.')
        return
      }
      // texto da aba aberta (para melhorar / servir de referência); só em abas de texto
      const textoAba = abaEhTexto ? htmlParaTexto((ent as unknown as Record<string, string>)[abaAtual] ?? '') : ''
      const dados =
        `# Entidade\nNome: ${ent.nome}\nResumo: ${ent.resumo}` +
        (textoAba ? `\nTexto atual da seção "${rotuloAbaAtual}":\n${textoAba}` : '')
      const contexto = montarContexto()
      const system = contexto ? `${SYSTEM_MESTRE}\n\n# Contexto da campanha\n${contexto}` : SYSTEM_MESTRE

      const imagens: ImagemIA[] = []
      if (opts.comImagem) {
        if (!ent.retrato || !vaultPath) throw new Error('Esta entidade não tem imagem.')
        const resp = await fetch(convertFileSrc(`${vaultPath}/${ent.retrato}`))
        if (!resp.ok) throw new Error(`fetch falhou: ${resp.status}`)
        const blob = await resp.blob()
        imagens.push({ mimeType: mimeDaImagem(ent.retrato), base64: uint8ParaBase64(new Uint8Array(await blob.arrayBuffer())) })
      }

      const texto = await gerarConteudo({
        system,
        historico: [{ papel: 'user', texto: `${dados}\n\n${opts.prompt}` }],
        imagens,
      })
      if (!montadoRef.current) return
      setPreview({ rotulo: opts.rotulo, destino: opts.destino, rotuloDestino: opts.rotuloDestino, texto })
    } catch (e) {
      if (montadoRef.current) setErro(e instanceof Error ? e.message : String(e))
    } finally {
      if (montadoRef.current) setRodando(false)
    }
  }

  function enviarPergunta() {
    const q = pergunta.trim()
    if (!q) return
    setPergunta('')
    // resposta vai para a aba atual (se de texto) ou Anotações (abas sem texto)
    const destino = abaEhTexto ? abaAtual : 'anotacoes'
    const rotuloDestino = abaEhTexto ? rotuloAbaAtual : 'Anotações'
    void executar({ rotulo: 'Resposta da IA', destino, rotuloDestino, prompt: q })
  }

  return (
    <div className="acoes-ia" ref={raizRef}>
      <button
        className="btn-icon"
        title="Ações de IA"
        disabled={rodando}
        onClick={() => {
          setErro(null)
          setMenuAberto((v) => !v)
        }}
      >
        {rodando ? '…' : '✨'}
      </button>
      {menuAberto && (
        <div className="acoes-ia-menu">
          {abaEhTexto && (
            <>
              <button onClick={() => void executar({ rotulo: `${rotuloAbaAtual} — curta`, destino: abaAtual, rotuloDestino: rotuloAbaAtual, prompt: promptVersao(rotuloAbaAtual, 'curta') })}>
                Versão curta
              </button>
              <button onClick={() => void executar({ rotulo: `${rotuloAbaAtual} — longa`, destino: abaAtual, rotuloDestino: rotuloAbaAtual, prompt: promptVersao(rotuloAbaAtual, 'longa') })}>
                Versão longa
              </button>
              <button onClick={() => void executar({ rotulo: `Melhorar ${rotuloAbaAtual}`, destino: abaAtual, rotuloDestino: rotuloAbaAtual, prompt: promptMelhorar(rotuloAbaAtual) })}>
                Melhorar
              </button>
            </>
          )}
          {acoes.map((a) => (
            <button
              key={a.rotulo}
              onClick={() =>
                void executar({ rotulo: a.rotulo, destino: a.abaDestino, rotuloDestino: a.rotuloDestino ?? a.abaDestino, prompt: a.prompt, comImagem: a.comImagem })
              }
            >
              {a.rotulo}
            </button>
          ))}
          <div className="acoes-ia-perguntar">
            <textarea
              placeholder="Perguntar / pedir conselho…"
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviarPergunta()
                }
              }}
            />
            <button disabled={!pergunta.trim()} onClick={enviarPergunta}>Enviar</button>
          </div>
        </div>
      )}
      {erro && <div className="acoes-ia-erro">{erro}</div>}
      {preview && (
        <div className="acoes-ia-overlay" onClick={() => setPreview(null)}>
          <div className="acoes-ia-preview" onClick={(e) => e.stopPropagation()}>
            <div className="acoes-ia-preview-titulo">{preview.rotulo}</div>
            <div className="acoes-ia-preview-texto">{preview.texto}</div>
            <div className="acoes-ia-preview-acoes">
              <button onClick={() => setPreview(null)}>Descartar</button>
              <button
                onClick={() => {
                  onInserir(preview.destino, textoParaHtml(preview.texto), 'adicionar')
                  setPreview(null)
                }}
              >
                Adicionar em {preview.rotuloDestino}
              </button>
              <button
                className="acoes-ia-inserir"
                onClick={() => {
                  onInserir(preview.destino, textoParaHtml(preview.texto), 'substituir')
                  setPreview(null)
                }}
              >
                Substituir em {preview.rotuloDestino}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build (vai falhar nos modais — esperado)**

Run: `npm run build`
Expected: erros de tipo em `PerfilModal.tsx`/`CenarioModal.tsx` (props novas faltando, `onInserir` com aridade diferente). Isso é resolvido na Task 3 — NÃO comitar ainda; seguir direto para a Task 3 e comitar as duas juntas.

---

## Task 3: Integração nos modais + CSS

**Files:**
- Modify: `src/components/PerfilModal.tsx`, `src/components/CenarioModal.tsx`, `src/theme.css`

- [ ] **Step 1: PerfilModal**

- Reduzir `ACOES_IA_PERSONAGEM` para só a específica (a de descrição virou universal):

```tsx
const ACOES_IA_PERSONAGEM: AcaoIA[] = [
  {
    rotulo: 'Sugerir segredos e ganchos',
    prompt: 'Sugira 3 segredos ou ganchos de aventura envolvendo este personagem, em lista curta.',
    abaDestino: 'anotacoes',
    rotuloDestino: 'Anotações',
  },
]
```

- Trocar o `<AcoesIA>` por (passa aba atual + trata `modo`):

```tsx
<AcoesIA
  entidadeTipo="personagem"
  entidadeId={personagemId}
  abaAtual={aba}
  rotuloAbaAtual={ABAS.find((a) => a.id === aba)?.rotulo ?? aba}
  abaEhTexto={aba !== 'imagens' && aba !== 'vinculos'}
  acoes={ACOES_IA_PERSONAGEM}
  onInserir={(abaDestino, html, modo) => {
    const atual = useApp.getState().personagens[personagemId]
    const base = atual ? (atual[abaDestino as AbaTexto] ?? '') : ''
    const novo = modo === 'substituir' ? html : base + html
    agendarSalvar({ [abaDestino]: novo } as Partial<Personagem>)
    setAba(abaDestino as Aba)
  }}
/>
```

- [ ] **Step 2: CenarioModal**

- Reduzir `ACOES_IA_CENARIO` para as específicas (remover "Gerar/melhorar descrição"; manter "Sugerir eventos" e "Analisar imagem"):

```tsx
const ACOES_IA_CENARIO: AcaoIA[] = [
  {
    rotulo: 'Sugerir eventos',
    prompt: 'Sugira 3 eventos que podem acontecer neste cenário (lista curta, um por linha, com gatilho e consequência).',
    abaDestino: 'eventos',
    rotuloDestino: 'Eventos',
  },
  {
    rotulo: 'Analisar imagem',
    prompt: 'Analise a imagem deste cenário: descreva o que se vê e sugira 3 pontos de interesse para os jogadores explorarem.',
    abaDestino: 'anotacoes',
    rotuloDestino: 'Anotações',
    comImagem: true,
  },
]
```

- Trocar o `<AcoesIA>` por (não-texto: `imagens`, `conteudo`, `vinculos`):

```tsx
<AcoesIA
  entidadeTipo="cenario"
  entidadeId={cenarioId}
  abaAtual={aba}
  rotuloAbaAtual={ABAS.find((a) => a.id === aba)?.rotulo ?? aba}
  abaEhTexto={aba !== 'imagens' && aba !== 'conteudo' && aba !== 'vinculos'}
  acoes={ACOES_IA_CENARIO}
  onInserir={(abaDestino, html, modo) => {
    const atual = useApp.getState().cenarios[cenarioId]
    const base = atual ? (atual[abaDestino as AbaTexto] ?? '') : ''
    const novo = modo === 'substituir' ? html : base + html
    agendarSalvar({ [abaDestino]: novo } as Partial<Cenario>)
    setAba(abaDestino as Aba)
  }}
/>
```

(Confirmar que `AbaTexto` do CenarioModal exclui `imagens`, `conteudo` E `vinculos`; se `vinculos` não estiver no Exclude atual, ajustar — o cast `abaDestino as AbaTexto` precisa cobrir só campos de texto do `Cenario`, e os destinos possíveis são sempre de texto.)

- [ ] **Step 3: CSS — input de perguntar + 3 botões**

Em `theme.css`, no bloco `/* ---- ações IA (modais) ---- */`:

```css
.acoes-ia-perguntar { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-top: 1px solid var(--borda); }
.acoes-ia-perguntar textarea {
  background: var(--fundo); border: 1px solid var(--borda); border-radius: 6px;
  color: var(--texto); padding: 6px 8px; font-size: 12px; font-family: var(--sans);
  resize: vertical; min-height: 44px;
}
.acoes-ia-perguntar button { align-self: flex-end; font-size: 12px; padding: 4px 12px; }
.acoes-ia-perguntar button:disabled { opacity: 0.4; cursor: default; }
```

Garantir que `.acoes-ia-preview-acoes` acomoda 3 botões (já é `display:flex; justify-content:flex-end; gap`). Se ficar apertado, `flex-wrap: wrap`.

- [ ] **Step 4: Build + suíte + teste manual**

Run: `npm run build` (tsc limpo) e `npm run test` (212 mantido + 4 da Task 1 = 216).
`npm run dev`: abrir personagem → aba História → ✨ → "Versão longa" → preview → "Substituir em História" (texto entra e a aba abre). Voltar, aba Descrição → ✨ → "Perguntar" → "que segredo esse cara esconde?" → resposta no preview → "Adicionar em Descrição" ou Descartar. Aba Imagens → ✨ → só "Perguntar" + "Segredos e ganchos" (sem curta/longa/melhorar). Cenário: aba Eventos → "Versão curta"; aba Conteúdo/Vínculos → sem ações tab-aware.

- [ ] **Step 5: Commit (Tasks 2+3 juntas)**

```bash
git add src/components/AcoesIA.tsx src/components/PerfilModal.tsx src/components/CenarioModal.tsx src/theme.css
git commit -m "feat(ia): acoes por aba nos modais (curta/longa/melhorar/perguntar) com substituir ou adicionar"
```

---

## Verificação final

- [ ] `npm run test` — suíte verde (novo: promptsIA).
- [ ] `npm run build` — tsc limpo.
- [ ] Manual: cada aba de texto (curta/longa/melhorar + substituir/adicionar); perguntar com inserir opcional; abas não-texto sem ações tab-aware; ações específicas seguem funcionando; sem-chave/erro amigável.
- [ ] `git log` — nenhum commit com `.env`/chave.

## Notas de risco

- **Cast `abaDestino as AbaTexto`**: os destinos possíveis são sempre campos de
  texto (universal = aba atual só quando `abaEhTexto`; pergunta em aba não-texto
  cai em `anotacoes`; específicas têm destino de texto fixo). Se o `tsc` reclamar,
  o Exclude de `AbaTexto` no modal precisa cobrir todas as abas não-texto.
- **Substituir é destrutivo**: mitigado pelo preview (confirmação visual) — o
  usuário vê o texto antes de trocar.
- **`ent[abaAtual]`**: só lido quando `abaEhTexto`, então sempre um campo HTML do
  modelo; o cast `Record<string,string>` é seguro nesse caminho.

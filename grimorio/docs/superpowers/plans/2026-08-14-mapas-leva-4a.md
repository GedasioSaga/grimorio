# Mapa — Leva 4a: as peças

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O mapa ganha vocabulário de peças com identidade própria — porta que abre vão de verdade e se pinta sozinha, rótulo, móvel, passagem secreta, armadilha e marcador numerado — todas atrás de uma gaveta "Peças ▾".

**Architecture:** Decisão em lib pura testável, efeito no componente (padrão firmado na fatia 3). `paletaMapa.ts` ganha as peças e um campo `tipo` que diz como cada uma entra no mapa; `portaMapa.ts` (novo) concentra as decisões puras da porta e do marcador; `PortaShape.tsx` (novo) é o único desenho próprio; a identidade (`meta.peca`) é carimbada no mesmo side effect de criação que já carimba `meta.camada`.

**Tech Stack:** React 19 + TypeScript, tldraw 4.5.12, vitest (jsdom só onde precisa de DOM), Tauri 2.

**Spec:** `docs/superpowers/specs/2026-08-14-mapas-fatia-4-design.md`

**Base ao iniciar:** main em `336ab75`+, suíte 1047 PASS, `npx tsc --noEmit` limpo.

**Regras:** pt-BR em nomes e comentários; TDD nas libs puras; `npx tsc --noEmit` + `npx vitest run` limpos antes de cada commit; API do tldraw SEMPRE conferida em `node_modules/`, nunca chutada.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/paletaMapa.ts` (modificar) | catálogo das peças: id, rótulo, glifo, como entra no mapa (`tipo`), estilos |
| `src/lib/portaMapa.ts` (criar) | decisões puras: cor do vão da porta, próximo número do marcador |
| `src/components/PortaShape.tsx` (criar) | ShapeUtil da porta: desenho SVG + auto-cor ao criar e ao soltar |
| `src/components/PecaAtiva.tsx` (criar) | contexto que leva a peça escolhida da toolbar (dentro do `<Tldraw>`) até o MapaView (fora) |
| `src/components/GavetaPecas.tsx` (criar) | grade flutuante com as peças nomeadas |
| `src/components/MapaToolbar.tsx` (modificar) | perde os botões soltos de peça, ganha o botão da gaveta |
| `src/components/MapaView.tsx` (modificar) | registra o `PortaShape`, provê o contexto de peça ativa, carimba `meta.peca` |
| `src/test/paletaMapa.test.ts` (modificar) | peças novas e o campo `tipo` |
| `src/test/portaMapa.test.ts` (criar) | cor do vão e numeração |

---

### Task 1: catálogo de peças

**Files:**
- Modify: `src/lib/paletaMapa.ts`
- Test: `src/test/paletaMapa.test.ts`

Hoje `ElementoPaleta` assume que toda peça é uma forma `geo` pré-estilizada, com a Escada
como exceção sem campo que a identifique (o botão da toolbar testa `elemento.id === 'escada'`
na mão). Com Porta, Marcador e Rótulo entrando, viram quatro exceções — por isso o campo
`tipo` explícito.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `src/test/paletaMapa.test.ts`:

```ts
describe('peças da leva 4a', () => {
  it('classifica cada peça pelo jeito que ela entra no mapa', () => {
    const porTipo = (tipo: ElementoPaleta['tipo']) =>
      ELEMENTOS_PALETA.filter((e) => e.tipo === tipo).map((e) => e.id)

    expect(porTipo('geo')).toEqual(['sala', 'parede', 'janela', 'movel', 'secreta', 'armadilha'])
    expect(porTipo('texto')).toEqual(['rotulo'])
    expect(porTipo('acao')).toEqual(['porta', 'escada', 'marcador'])
  })

  it('toda peça geo declara a forma tldraw e ao menos um estilo', () => {
    for (const e of ELEMENTOS_PALETA.filter((el) => el.tipo === 'geo')) {
      expect(e.geo, `peça ${e.id} sem geo`).toBeTruthy()
      expect(Object.keys(e.estilos).length, `peça ${e.id} sem estilo`).toBeGreaterThan(0)
    }
  })

  it('todo estilo usa valor que existe no tlschema do tldraw', () => {
    // valores conferidos em node_modules/@tldraw/tlschema/src/styles/:
    // TLColorStyle.ts:23-37, TLFillStyle.ts:39, TLDashStyle.ts:38, TLSizeStyle.ts:38
    const validos: Record<string, string[]> = {
      color: ['black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 'yellow',
              'orange', 'green', 'light-green', 'light-red', 'red', 'white'],
      fill: ['none', 'semi', 'solid', 'pattern', 'fill', 'lined-fill'],
      dash: ['draw', 'solid', 'dashed', 'dotted'],
      size: ['s', 'm', 'l', 'xl'],
    }
    for (const e of ELEMENTOS_PALETA) {
      for (const [nome, valor] of Object.entries(e.estilos)) {
        expect(validos[nome], `estilo desconhecido: ${nome}`).toBeTruthy()
        expect(validos[nome], `${e.id}.${nome} = ${valor}`).toContain(valor)
      }
    }
  })

  it('cada peça tem id único', () => {
    const ids = ELEMENTOS_PALETA.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

Ajustar o import do topo do arquivo para trazer também o tipo:

```ts
import { ELEMENTOS_PALETA, type ElementoPaleta } from '../lib/paletaMapa'
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/test/paletaMapa.test.ts`
Expected: FAIL — `tipo` não existe em `ElementoPaleta`, peças novas ausentes.

- [ ] **Step 3: Implementar**

Em `src/lib/paletaMapa.ts`, substituir a interface e a lista:

```ts
export type PecaId =
  | 'sala' | 'parede' | 'porta' | 'janela' | 'escada'
  | 'movel' | 'secreta' | 'armadilha' | 'marcador' | 'rotulo'

export interface ElementoPaleta {
  id: PecaId
  rotulo: string
  glifo: string
  /**
   * Como a peça entra no mapa:
   * - `geo`: pré-estila a próxima forma (`setStyleForNextShapes`) e liga a ferramenta `geo`
   * - `texto`: idem, mas liga a ferramenta `text`
   * - `acao`: a toolbar cria a forma na hora (escada, porta e marcador não são geo puro)
   */
  tipo: 'geo' | 'texto' | 'acao'
  estilos: Record<string, string>
  geo?: string
}

export const ELEMENTOS_PALETA: ElementoPaleta[] = [
  {
    id: 'sala',
    rotulo: 'Sala',
    glifo: '⬛',
    tipo: 'geo',
    geo: 'rectangle',
    estilos: { color: 'green', fill: 'solid', dash: 'solid', size: 's' },
  },
  {
    id: 'parede',
    rotulo: 'Parede',
    glifo: '▤',
    tipo: 'geo',
    geo: 'rectangle',
    estilos: { color: 'white', fill: 'solid', dash: 'solid', size: 'm' },
  },
  {
    // porta virou shape próprio nesta leva (vão + jambas + arco): ver PortaShape.tsx
    id: 'porta',
    rotulo: 'Porta',
    glifo: '🚪',
    tipo: 'acao',
    estilos: {},
  },
  {
    id: 'janela',
    rotulo: 'Janela',
    glifo: '▭',
    tipo: 'geo',
    geo: 'rectangle',
    estilos: { color: 'light-blue', fill: 'none', dash: 'solid', size: 's' },
  },
  {
    id: 'escada',
    rotulo: 'Escada',
    glifo: '≡',
    tipo: 'acao',
    estilos: {},
  },
  {
    // mobília ocupa espaço dentro da sala sem competir com a parede: cinza, sólido, fino
    id: 'movel',
    rotulo: 'Móvel',
    glifo: '▬',
    tipo: 'geo',
    geo: 'rectangle',
    estilos: { color: 'grey', fill: 'solid', dash: 'solid', size: 's' },
  },
  {
    // tracejado violeta: some no mapa impresso e salta quando o mestre procura
    id: 'secreta',
    rotulo: 'Passagem secreta',
    glifo: '◈',
    tipo: 'geo',
    geo: 'rectangle',
    estilos: { color: 'violet', fill: 'none', dash: 'dashed', size: 's' },
  },
  {
    id: 'armadilha',
    rotulo: 'Armadilha',
    glifo: '⚠',
    tipo: 'geo',
    geo: 'triangle',
    estilos: { color: 'red', fill: 'none', dash: 'solid', size: 's' },
  },
  {
    // círculo com número, amarrando o ponto do mapa à anotação escrita
    id: 'marcador',
    rotulo: 'Marcador numerado',
    glifo: '①',
    tipo: 'acao',
    estilos: { color: 'yellow', fill: 'solid', dash: 'solid', size: 's' },
  },
  {
    id: 'rotulo',
    rotulo: 'Rótulo',
    glifo: 'A',
    tipo: 'texto',
    estilos: { color: 'white', size: 's' },
  },
]
```

- [ ] **Step 4: Rodar o teste e a suíte inteira**

Run: `npx vitest run src/test/paletaMapa.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: erros em `MapaToolbar.tsx` — ele ainda usa a forma antiga (`elemento.geo` sem `tipo`). **Isso é esperado**; a Task 5 conserta. Se quiser o passo verde agora, faça a Task 5 antes de commitar as duas juntas.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paletaMapa.ts src/test/paletaMapa.test.ts
git commit -m "feat(mapas): catalogo de pecas com tipo explicito"
```

---

### Task 2: decisões puras da porta e do marcador

**Files:**
- Create: `src/lib/portaMapa.ts`
- Test: `src/test/portaMapa.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/portaMapa.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { COR_SALA_PADRAO, corDoVao, proximoNumero } from '../lib/portaMapa'

const sala = (color: string) => ({ meta: { peca: 'sala' }, props: { color } })

describe('corDoVao', () => {
  it('sem nada embaixo, usa a cor padrão de sala', () => {
    expect(corDoVao([])).toBe(COR_SALA_PADRAO)
  })

  it('pega a cor da sala embaixo', () => {
    expect(corDoVao([sala('blue')])).toBe('blue')
  })

  it('com várias formas empilhadas, vale a sala mais ao topo', () => {
    // getShapesAtPoint devolve top-most primeiro
    // (node_modules/@tldraw/editor/src/lib/editor/Editor.ts:5498)
    expect(corDoVao([sala('red'), sala('green')])).toBe('red')
  })

  it('ignora forma que não é sala', () => {
    const parede = { meta: { peca: 'parede' }, props: { color: 'white' } }
    expect(corDoVao([parede, sala('green')])).toBe('green')
  })

  it('ignora forma sem identidade de peça (desenho antigo)', () => {
    const solta = { meta: {}, props: { color: 'orange' } }
    expect(corDoVao([solta])).toBe(COR_SALA_PADRAO)
  })

  it('ignora sala sem cor legível', () => {
    const semCor = { meta: { peca: 'sala' }, props: {} }
    expect(corDoVao([semCor])).toBe(COR_SALA_PADRAO)
  })
})

describe('proximoNumero', () => {
  it('começa em 1 quando não há marcador', () => {
    expect(proximoNumero([])).toBe(1)
  })

  it('continua do maior existente', () => {
    expect(proximoNumero(['1', '2', '3'])).toBe(4)
  })

  it('não repete número quando apagam um do meio', () => {
    expect(proximoNumero(['1', '3'])).toBe(4)
  })

  it('ignora rótulo que não é número', () => {
    expect(proximoNumero(['1', 'entrada', '  '])).toBe(2)
  })

  it('ignora número negativo e zero', () => {
    expect(proximoNumero(['-5', '0'])).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/test/portaMapa.test.ts`
Expected: FAIL — `Cannot find module '../lib/portaMapa'`

- [ ] **Step 3: Implementar**

Criar `src/lib/portaMapa.ts`:

```ts
/**
 * Decisões puras da Porta e do Marcador numerado — sem tldraw, testáveis direto.
 *
 * A porta finge o vão cobrindo o trecho de parede com a MESMA cor do miolo da sala.
 * Quem descobre o que está embaixo é o `PortaShape` (via `editor.getShapesAtPoint`);
 * aqui mora só a regra de escolha.
 */

/** Cor de sala usada quando a porta não está sobre nenhuma sala. Bate com a peça `sala`. */
export const COR_SALA_PADRAO = 'green'

interface FormaSob {
  meta?: Record<string, unknown>
  props?: Record<string, unknown>
}

/**
 * Cor do buraco da porta: a da primeira SALA da lista.
 *
 * `editor.getShapesAtPoint` devolve as formas com a mais ao topo PRIMEIRO
 * (node_modules/@tldraw/editor/src/lib/editor/Editor.ts:5498) — por isso a varredura é
 * direta, e não de trás pra frente. Formas escondidas já vêm filtradas de lá, então uma
 * sala em camada oculta nunca tinge a porta.
 */
export function corDoVao(formasSob: FormaSob[], padrao: string = COR_SALA_PADRAO): string {
  for (const forma of formasSob) {
    if (forma.meta?.peca !== 'sala') continue
    const cor = forma.props?.color
    if (typeof cor === 'string' && cor.length > 0) return cor
  }
  return padrao
}

/**
 * Próximo número do marcador: maior existente + 1.
 *
 * Somar 1 ao MAIOR (em vez de contar quantos existem) é o que evita repetir número
 * depois de apagar um marcador do meio da sequência.
 */
export function proximoNumero(rotulos: string[]): number {
  let maior = 0
  for (const rotulo of rotulos) {
    const numero = Number.parseInt(rotulo.trim(), 10)
    if (Number.isFinite(numero) && numero > maior) maior = numero
  }
  return maior + 1
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/test/portaMapa.test.ts`
Expected: PASS (11 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/portaMapa.ts src/test/portaMapa.test.ts
git commit -m "feat(mapas): regras puras da porta (cor do vao) e do marcador (numeracao)"
```

---

### Task 3: PortaShape — o desenho da porta

**Files:**
- Create: `src/components/PortaShape.tsx`

Sem teste automatizado: é desenho dentro do editor tldraw, que não roda em jsdom. A
verificação é a Task 7. O que dava pra testar puro (a escolha de cor) já saiu na Task 2.

- [ ] **Step 1: Criar o arquivo**

```tsx
import {
  BaseBoxShapeUtil,
  SVGContainer,
  T,
  getColorValue,
  getDefaultColorTheme,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { COR_SALA_PADRAO, corDoVao } from '../lib/portaMapa'

/** Vão padrão: ~1 quadrado de largura por meia parede de espessura. */
export const PORTA_LARGURA_PADRAO = 32
export const PORTA_ESPESSURA_PADRAO = 14

// tldraw 4.x: shapes customizados entram no union TLShape via augmentation do
// TLGlobalShapePropsMap (mesmo padrão de CharacterCardShape.tsx).
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'porta-mapa': {
      w: number
      h: number
      /** nome de cor do tldraw ('green', 'blue'…) copiado da sala sob a porta */
      cor: string
    }
  }
}

export type PortaShapeType = TLShape<'porta-mapa'>

/**
 * Porta do mapa: não é um símbolo POR CIMA da parede, é o buraco NA parede.
 *
 * Desenha três coisas: (1) um retângulo da cor do miolo da sala, que apaga o trecho de
 * contorno onde a porta está; (2) as duas jambas, marcando onde a parede recomeça;
 * (3) o arco de abertura.
 *
 * A cor do buraco é copiada da sala embaixo — ao criar (`onBeforeCreate`, ShapeUtil.ts:615)
 * e toda vez que o usuário solta a porta em outro lugar (`onTranslateEnd`, ShapeUtil.ts:763).
 * Sem isso o usuário teria que repintar a porta à mão cada vez que trocasse a cor de uma
 * sala.
 *
 * CUIDADO com a variante de cor: `fill: 'solid'` do tldraw NÃO pinta com a cor sólida —
 * pinta com a variante `semi` (node_modules/tldraw/src/lib/shapes/shared/ShapeFill.tsx:32-33).
 * O buraco usa a mesma `semi`, senão fica de um tom visivelmente diferente do miolo da sala
 * e o efeito de vão se perde.
 */
export class PortaShapeUtil extends BaseBoxShapeUtil<PortaShapeType> {
  static override type = 'porta-mapa' as const

  static override props: RecordProps<PortaShapeType> = {
    w: T.positiveNumber,
    h: T.positiveNumber,
    cor: T.string,
  }

  getDefaultProps(): PortaShapeType['props'] {
    return { w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, cor: COR_SALA_PADRAO }
  }

  /** Cor da sala sob o CENTRO da porta; sem sala embaixo, mantém a que já está. */
  private corSob(shape: PortaShapeType): string {
    const bounds = this.editor.getShapePageBounds(shape.id)
    if (!bounds) return shape.props.cor
    const formasSob = this.editor
      .getShapesAtPoint(bounds.center, { hitInside: true })
      .filter((s) => s.id !== shape.id)
    return corDoVao(formasSob, shape.props.cor)
  }

  override onBeforeCreate(next: PortaShapeType) {
    return { ...next, props: { ...next.props, cor: this.corSob(next) } }
  }

  override onTranslateEnd(_initial: PortaShapeType, current: PortaShapeType) {
    return { id: current.id, type: current.type, props: { ...current.props, cor: this.corSob(current) } }
  }

  component(shape: PortaShapeType) {
    const { w, h, cor } = shape.props
    const tema = getDefaultColorTheme({ isDarkMode: this.editor.user.getIsDarkMode() })
    const corDoBuraco = getColorValue(tema, cor as never, 'semi')
    const corDoTraco = getColorValue(tema, cor as never, 'solid')
    const raio = Math.min(w, h * 2)

    return (
      <SVGContainer>
        {/* o buraco: apaga o contorno da parede no vão */}
        <rect x={0} y={0} width={w} height={h} fill={corDoBuraco} />
        {/* jambas: onde a parede recomeça dos dois lados */}
        <line x1={0} y1={0} x2={0} y2={h} stroke={corDoTraco} strokeWidth={1.5} />
        <line x1={w} y1={0} x2={w} y2={h} stroke={corDoTraco} strokeWidth={1.5} />
        {/* arco de abertura */}
        <path
          d={`M 0 ${h} A ${raio} ${raio} 0 0 1 ${Math.min(w, raio)} ${h - Math.min(h, raio)}`}
          fill="none"
          stroke={corDoTraco}
          strokeWidth={1}
          opacity={0.6}
        />
      </SVGContainer>
    )
  }

  indicator(shape: PortaShapeType) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
```

- [ ] **Step 2: Conferir que compila**

Run: `npx tsc --noEmit`
Expected: sem erro NESTE arquivo. Se `getColorValue`/`getDefaultColorTheme` não vierem de
`'tldraw'`, importe de `'@tldraw/tlschema'` — os dois estão exportados lá
(node_modules/@tldraw/tlschema/src/index.ts:273-274).

- [ ] **Step 3: Commit**

```bash
git add src/components/PortaShape.tsx
git commit -m "feat(mapas): PortaShape desenha o vao e copia a cor da sala"
```

---

### Task 4: identidade da peça (`meta.peca`)

**Files:**
- Create: `src/components/PecaAtiva.tsx`
- Modify: `src/components/MapaView.tsx`

A toolbar vive DENTRO do `<Tldraw>` e o side effect que carimba metadados vive no
`MapaView`, fora dele. O contexto resolve o mesmo problema que o `SelecaoPropriedadesBridge`
já resolve para a seleção — mesmo padrão, direção inversa.

- [ ] **Step 1: Criar o contexto**

`src/components/PecaAtiva.tsx`:

```tsx
import { createContext, useContext } from 'react'
import type { PecaId } from '../lib/paletaMapa'

/**
 * Qual peça da paleta está escolhida agora.
 *
 * Vai da toolbar (dentro do `<Tldraw>`) para o `MapaView` (fora), que carimba
 * `meta.peca` na forma no momento da criação. Mesmo motivo do Context em
 * PainelPropriedades.tsx: `components` do `<Tldraw>` é constante de módulo, então não dá
 * para passar callback de instância por prop.
 */
const PecaAtivaContext = createContext<(peca: PecaId | null) => void>(() => {})

export const ProvedorPecaAtiva = PecaAtivaContext.Provider

export function useDefinirPecaAtiva() {
  return useContext(PecaAtivaContext)
}
```

- [ ] **Step 2: Ligar no MapaView**

Em `src/components/MapaView.tsx`:

1. Nos imports, adicionar:

```tsx
import { ProvedorPecaAtiva } from './PecaAtiva'
import { PortaShapeUtil } from './PortaShape'
import type { PecaId } from '../lib/paletaMapa'
```

2. Registrar o shape novo — trocar a linha do `shapeUtilsCustom`:

```tsx
const shapeUtilsCustom = [CharacterCardShapeUtil, CenarioCardShapeUtil, ItemCardShapeUtil, PortaShapeUtil]
```

3. Dentro do componente, junto dos outros refs (perto de `camadaAtivaIdRef`):

```tsx
  // peça escolhida na gaveta; lida pelo side effect de criação, por isso vive num ref
  const pecaAtivaRef = useRef<PecaId | null>(null)
  const definirPecaAtiva = useCallback((peca: PecaId | null) => {
    pecaAtivaRef.current = peca
  }, [])
```

E acrescentar `useCallback` ao import do React no topo do arquivo.

4. No `registerBeforeCreateHandler`, carimbar a peça junto da camada. Substituir o `return`
final do handler por:

```tsx
            const peca = pecaAtivaRef.current
            return {
              ...shape,
              meta: {
                ...shape.meta,
                camada: ativa,
                ...(peca ? { peca } : {}),
                ...(travadaPelaCamada ? { travadoPelaCamada: true } : {}),
              },
              isLocked: travadaPelaCamada ? true : shape.isLocked,
            }
```

5. Envolver o `<Tldraw>` com o provedor novo, por fora do `ProvedorSelecaoPropriedades`
que já existe:

```tsx
      <ProvedorPecaAtiva value={definirPecaAtiva}>
      <ProvedorSelecaoPropriedades value={setSelecaoProp}>
        {/* ...<Tldraw> como está... */}
      </ProvedorSelecaoPropriedades>
      </ProvedorPecaAtiva>
```

- [ ] **Step 3: Conferir**

Run: `npx tsc --noEmit`
Expected: sem erro novo (os erros de `MapaToolbar` da Task 1 seguem até a Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/components/PecaAtiva.tsx src/components/MapaView.tsx
git commit -m "feat(mapas): forma nova nasce carimbada com a peca que a criou"
```

---

### Task 5: gaveta "Peças ▾"

**Files:**
- Create: `src/components/GavetaPecas.tsx`
- Modify: `src/components/MapaToolbar.tsx`, `src/theme.css`

- [ ] **Step 1: Criar a gaveta**

`src/components/GavetaPecas.tsx`:

```tsx
import { useState } from 'react'
import { ELEMENTOS_PALETA, type ElementoPaleta } from '../lib/paletaMapa'

/**
 * Grade flutuante com as peças do mapa, cada uma com NOME.
 *
 * São dez peças: numa fileira de ícones sem rótulo elas não se distinguem (o usuário
 * teria que passar o mouse em cada uma). A gaveta troca um clique a mais pela leitura
 * imediata.
 */
export function GavetaPecas({
  pecaAtivaId,
  aoEscolher,
}: {
  pecaAtivaId: string | undefined
  aoEscolher: (elemento: ElementoPaleta) => void
}) {
  const [aberta, setAberta] = useState(false)

  return (
    <div className="gaveta-pecas">
      {aberta && (
        <div className="gaveta-pecas-grade" role="menu">
          {ELEMENTOS_PALETA.map((elemento) => (
            <button
              key={elemento.id}
              type="button"
              role="menuitem"
              className={`gaveta-pecas-item${pecaAtivaId === elemento.id ? ' ativo' : ''}`}
              onClick={() => {
                aoEscolher(elemento)
                setAberta(false)
              }}
            >
              <span className="gaveta-pecas-glifo">{elemento.glifo}</span>
              <span className="gaveta-pecas-nome">{elemento.rotulo}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`btn-icon${aberta ? ' ativo' : ''}`}
        title="Peças do mapa"
        onClick={() => setAberta((a) => !a)}
      >
        Peças ▾
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Trocar os botões soltos pela gaveta na toolbar**

Em `src/components/MapaToolbar.tsx`:

1. Importar:

```tsx
import { GavetaPecas } from './GavetaPecas'
import { useDefinirPecaAtiva } from './PecaAtiva'
import { toRichText } from 'tldraw'
import { PORTA_ESPESSURA_PADRAO, PORTA_LARGURA_PADRAO } from './PortaShape'
import { proximoNumero } from '../lib/portaMapa'
```

2. Dentro do componente, pegar o setter do contexto:

```tsx
  const definirPecaAtiva = useDefinirPecaAtiva()
```

3. Substituir a função `aplicarElementoPaleta` inteira por esta versão, que despacha pelo
`tipo` em vez de testar o id na mão:

```tsx
  function aplicarElementoPaleta(elemento: ElementoPaleta) {
    definirPecaAtiva(elemento.id)

    if (elemento.tipo === 'acao') {
      if (elemento.id === 'escada') criarEscada()
      if (elemento.id === 'porta') criarPorta()
      if (elemento.id === 'marcador') criarMarcador()
      return
    }

    editor.run(() => {
      if (elemento.geo) editor.setStyleForNextShapes(GeoShapeGeoStyle, elemento.geo)
      for (const [nomeStyle, valor] of Object.entries(elemento.estilos)) {
        const style = STYLE_PROPS_POR_NOME[nomeStyle]
        if (style) editor.setStyleForNextShapes(style, valor)
      }
      editor.setCurrentTool(elemento.tipo === 'texto' ? 'text' : 'geo')
    })
  }
```

4. Acrescentar as duas ações novas, ao lado de `criarEscada`:

```tsx
  /**
   * Porta nasce no centro da tela e o usuário arrasta até a parede — ao soltar, ela se
   * pinta com a cor da sala (`onTranslateEnd` do PortaShape). `bringToFront`
   * (Editor.ts:6780) garante que ela fique à frente da sala; sem isso o vão sumiria
   * atrás do preenchimento.
   */
  function criarPorta() {
    const centro = editor.getViewportPageBounds().center
    const id = createShapeId()
    editor.run(() => {
      editor.createShape({
        id,
        type: 'porta-mapa',
        x: centro.x - PORTA_LARGURA_PADRAO / 2,
        y: centro.y - PORTA_ESPESSURA_PADRAO / 2,
      })
      editor.bringToFront([id])
      editor.setCurrentTool('select')
      editor.setSelectedShapes([id])
    })
  }

  /**
   * Marcador: círculo amarelo com o próximo número livre. O número sai de
   * `proximoNumero` (lib pura), lendo os marcadores que já existem na página pelo
   * `meta.peca`. `richText` é campo real do geo shape
   * (node_modules/@tldraw/tlschema/src/shapes/TLGeoShape.ts:109), montado com o helper
   * `toRichText` (:141).
   */
  function criarMarcador() {
    const centro = editor.getViewportPageBounds().center
    const existentes = editor
      .getCurrentPageShapes()
      .filter((s) => (s.meta as Record<string, unknown>).peca === 'marcador')
      .map((s) => {
        const props = (s as { props?: { richText?: unknown } }).props
        return typeof props?.richText === 'object' && props.richText !== null
          ? extrairTexto(props.richText)
          : ''
      })
    const numero = proximoNumero(existentes)
    const id = createShapeId()
    editor.run(() => {
      editor.createShape({
        id,
        type: 'geo',
        x: centro.x - 16,
        y: centro.y - 16,
        meta: { peca: 'marcador' },
        props: {
          geo: 'ellipse',
          w: 32,
          h: 32,
          color: 'yellow',
          fill: 'solid',
          dash: 'solid',
          size: 's',
          richText: toRichText(String(numero)),
        },
      })
      editor.bringToFront([id])
      editor.setCurrentTool('select')
    })
  }
```

5. Acrescentar o utilitário de leitura do texto rico, no fim do arquivo (fora do
componente):

```tsx
/** Texto puro de um `richText` do tldraw, para ler o número de um marcador. */
function extrairTexto(richText: unknown): string {
  const pilha: unknown[] = [richText]
  let saida = ''
  while (pilha.length) {
    const no = pilha.pop()
    if (!no || typeof no !== 'object') continue
    const registro = no as Record<string, unknown>
    if (typeof registro.text === 'string') saida += registro.text
    if (Array.isArray(registro.content)) pilha.push(...registro.content)
  }
  return saida
}
```

6. No JSX, trocar o bloco que mapeia `ELEMENTOS_PALETA` em botões pela gaveta:

```tsx
        <GavetaPecas pecaAtivaId={elementoPaletaAtivo?.id} aoEscolher={aplicarElementoPaleta} />
```

- [ ] **Step 3: CSS da gaveta**

Acrescentar em `src/theme.css`, logo depois das regras de `.mapa-toolbar`:

```css
/* gaveta de peças: grade flutuante ACIMA da toolbar (a toolbar mora no rodapé, então a
   grade sobe; `bottom: 100%` a ancora na borda de cima do botão). */
.gaveta-pecas { position: relative; display: flex; }
.gaveta-pecas-grade {
  position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
  margin-bottom: 6px; z-index: 400;
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px;
  width: 300px; padding: 6px;
  background: var(--fundo); border: 1px solid var(--borda); border-radius: 6px;
}
.gaveta-pecas-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: 4px; font-size: 12px;
  background: transparent; border: 1px solid transparent; color: var(--texto);
  text-align: left;
}
.gaveta-pecas-item:hover { background: var(--fundo-elevado); }
.gaveta-pecas-item.ativo { border-color: var(--dourado); color: var(--dourado-claro); }
.gaveta-pecas-item:active { transform: scale(0.97); }
.gaveta-pecas-glifo { font-size: 15px; width: 20px; text-align: center; flex: 0 0 auto; }
.gaveta-pecas-nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 4: Verificar tudo**

Run: `npx tsc --noEmit`
Expected: **limpo** — é aqui que os erros da Task 1 se resolvem.

Run: `npx vitest run`
Expected: PASS, sem regressão (1047 + os testes novos das Tasks 1 e 2).

- [ ] **Step 5: Commit**

```bash
git add src/components/GavetaPecas.tsx src/components/MapaToolbar.tsx src/theme.css
git commit -m "feat(mapas): gaveta de pecas com nomes, porta e marcador numerado"
```

---

### Task 6: verificação manual (usuário, no app)

Não há teste automatizado possível para desenho no editor tldraw — jsdom não renderiza o
canvas. Rodar `npm run tauri dev` e conferir, na ordem:

- [ ] Abrir a gaveta "Peças ▾": as dez peças aparecem com nome, em duas colunas.
- [ ] Desenhar duas salas encostadas. Inserir uma Porta: ela nasce no centro da tela, selecionada.
- [ ] Arrastar a porta até a parede entre as salas: o contorno abre, as jambas aparecem, o arco aparece.
- [ ] Pintar uma das salas de outra cor pelo painel de estilos e arrastar a porta para dentro dela: ao soltar, o vão assume a cor nova.
- [ ] Inserir três Marcadores: numeram 1, 2, 3. Apagar o 2 e inserir outro: sai 4, não 2.
- [ ] Escrever um Rótulo dentro de uma sala: legível sem ajuste de cor ou tamanho.
- [ ] Inserir Móvel, Passagem secreta e Armadilha: cada uma sai com aparência distinta.
- [ ] Fechar e reabrir o mapa: a porta continua desenhada igual (é o teste de que ela persiste no arquivo).

---

## Self-review

**Cobertura da spec (leva 4a):** identidade `meta.peca` → Task 4. Gaveta → Task 5.
PortaShape com auto-cor ao criar e ao mover → Task 3. Rótulo, Móvel, Passagem secreta,
Armadilha → Task 1. Marcador numerado → Tasks 1, 2 e 5. Sala: fora do escopo por já estar
no estilo certo, como a spec registra. Nada da leva 4a ficou sem tarefa.

**Placeholders:** nenhum passo diz "implementar depois" ou "tratar erros"; todo passo de
código traz o código.

**Consistência de tipos:** `PecaId` (Task 1) é o mesmo tipo usado em `PecaAtiva.tsx`
(Task 4) e no `pecaAtivaRef` do MapaView. `corDoVao`/`proximoNumero` (Task 2) têm as
assinaturas que as Tasks 3 e 5 chamam. `PORTA_LARGURA_PADRAO`/`PORTA_ESPESSURA_PADRAO`
são exportados na Task 3 e importados na Task 5. O type do shape é `'porta-mapa'` em
todos os lugares.

**Ponto de atenção deixado explícito:** a Task 1 deixa o `tsc` quebrado de propósito até a
Task 5 (a toolbar antiga não conhece o campo `tipo`). Quem executar em ordem não se
assusta; quem executar fora de ordem deve fazer 1 e 5 juntas.

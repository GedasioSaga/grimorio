// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useApp, estadoLimpoDeCofre } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'
import { useDocumentoTldraw } from '../components/canvasDoc'
import { SHAPE_UTILS_DO_STORE_MAPA } from '../lib/montagemMapa'

/**
 * Trava a classe de defeito que derrubou a tela do mapa: `useDocumentoTldraw` tem
 * `shapeUtils` nas deps do `useEffect` que monta o store (`canvasDoc.ts`). Um array de
 * IDENTIDADE INSTÁVEL (recalculado a cada render, mesmo com o MESMO conteúdo) refaz o
 * store a cada render → `setStore` → re-render → array novo de novo → laço infinito. Na
 * tela isso é o mapa PISCANDO e o canvas nunca terminando de carregar. O bug real era
 * `SHAPE_UTILS_DO_STORE_MAPA` como `function` chamada inline no render; virou `const`.
 *
 * `<Tldraw>` não monta em jsdom (`image.decode is not a function`), mas `useDocumentoTldraw`
 * é hook puro — só usa `createTLStore`/`loadSnapshot` do `@tldraw/store`, sem canvas/imagem.
 * Confirmado montando ele sozinho abaixo, sem `<Tldraw>` em lugar nenhum.
 *
 * Não testa "SHAPE_UTILS_DO_STORE_MAPA é uma const" (isso o `tsc` já garante: se alguém
 * reverter para `function` sem invocar, o tipo `TLAnyShapeUtilConstructor[]` esperado pelo
 * hook não bate, e `tsc --noEmit` já quebra). Testa o CONTRATO comportamental do hook: dado
 * um array estável, o efeito de carga roda uma vez só — não importa por que a Sonda
 * re-renderiza depois; dado um array recalculado a cada render (o padrão do bug histórico,
 * que digita sem erro de tipo), o efeito reroda a cada vez. Pega qualquer consumidor futuro
 * que cometer o mesmo erro, não só uma reversão literal da constante.
 */

const CAMINHO = 'mapas/teste-identidade.canvas.json'

/**
 * O array precisa ser calculado DENTRO do corpo da função — não recebido como prop já
 * pronto de fora — senão um re-render disparado pelo próprio `setStore` do hook reusa os
 * mesmos props (React não os recria sozinho) e a instabilidade nunca aparece. É exatamente
 * assim que o bug histórico vivia: `shapeUtilsDoStoreMapa()` chamada inline no corpo do
 * `MapaView`, não passada de um componente pai.
 */
function Sonda({ padrao, tick }: { padrao: 'estavel' | 'instavel'; tick: number }) {
  const shapeUtils = padrao === 'estavel' ? SHAPE_UTILS_DO_STORE_MAPA : [...SHAPE_UTILS_DO_STORE_MAPA]
  useDocumentoTldraw(CAMINHO, shapeUtils)
  return <div data-tick={tick} />
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  useApp.setState({ ...estadoLimpoDeCofre(), vaultPath: null, repo: null })
})

afterEach(() => {
  root.unmount()
  container.remove()
})

describe('useDocumentoTldraw — identidade de shapeUtils nas deps do efeito de carga', () => {
  it('array ESTÁVEL (SHAPE_UTILS_DO_STORE_MAPA, o padrão real): o efeito de carga roda uma vez só, mesmo com re-renders depois', async () => {
    const chamadas: string[] = []
    const repo = {
      async lerCanvasDoc(caminho: string) {
        chamadas.push(caminho)
        return { documento: null }
      },
    } as unknown as VaultRepo
    useApp.setState({ repo, vaultPath: 'C:/cofre' })

    await act(async () => {
      root.render(<Sonda padrao="estavel" tick={0} />)
    })
    expect(chamadas).toHaveLength(1)

    // re-render por motivo ALHEIO ao array (é o próprio `tick` mudando) — se o hook
    // estivesse errado, isso sozinho não deveria bastar pra reler; o array continua o
    // MESMO objeto (SHAPE_UTILS_DO_STORE_MAPA), então o efeito não deve rerodar.
    await act(async () => {
      root.render(<Sonda padrao="estavel" tick={1} />)
    })
    await act(async () => {
      root.render(<Sonda padrao="estavel" tick={2} />)
    })
    expect(chamadas).toHaveLength(1)
  })

  it('array INSTÁVEL (recalculado a cada render, mesmo conteúdo): o efeito de carga reroda — é o mecanismo exato do laço infinito', async () => {
    const chamadas: string[] = []
    let numeroDaChamada = 0
    const repo = {
      async lerCanvasDoc(caminho: string) {
        numeroDaChamada++
        chamadas.push(caminho)
        // a partir da 3ª chamada a promessa nunca resolve: quebra a cadeia de propósito
        // (setStore nunca é chamado de novo), senão o laço de verdade não teria fim — o
        // mesmo comportamento observado no defeito real, que estourava o timeout do teste.
        // Já são chamadas suficientes (>1) pra provar que o efeito rerodou por causa da
        // identidade instável, sem precisar deixar o laço correr pra sempre.
        if (numeroDaChamada >= 3) return new Promise<never>(() => {})
        return { documento: null }
      },
    } as unknown as VaultRepo
    useApp.setState({ repo, vaultPath: 'C:/cofre' })

    await act(async () => {
      root.render(<Sonda padrao="instavel" tick={0} />)
    })

    expect(chamadas.length).toBeGreaterThan(1)
  })
})

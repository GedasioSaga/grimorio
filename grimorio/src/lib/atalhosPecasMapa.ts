import type { Editor } from 'tldraw'

/**
 * Tecla → ferramenta de peça de construção.
 *
 * ## Por que existe
 *
 * As peças viraram ferramentas de desenho, mas armar cada uma exigia abrir a gaveta e clicar.
 * O gesto de construir ficou rápido; o de ESCOLHER o que construir, não. Numa planta em que se
 * alterna sala → corredor → porta o tempo todo, cada troca custava duas idas ao mesmo menu.
 *
 * ## Como as teclas foram escolhidas
 *
 * O tldraw já usa `v h e d b x r o a l f t n k` e `shift+d` (verificado em
 * `tldraw/src/lib/ui/hooks/useTools.tsx`). Sobrou pouco, então as quatro peças mais usadas
 * ficaram com a inicial em português — `s`ala, `c`orredor, `p`orta, `m`uralha — e as duas
 * raras entraram como `shift` da PARCEIRA de uso, não de uma letra qualquer:
 *
 * - `shift+s` = sala em polígono, irmã da sala
 * - `shift+m` = torre, que só existe encostada no canto da muralha
 * - `shift+c` = escada, que como o corredor é passagem, não cômodo
 *
 * Par de uso vale mais que mnemônico solto: quem acabou de apertar `m` para cercar a planta
 * tem a torre a um shift de distância, no mesmo dedo.
 *
 * ## O `r`
 *
 * É o único remapeado. Nativamente ele arma o retângulo `geo` do tldraw — que não tem canto
 * arredondado, não entra na banda de empilhamento do mapa e não aparece na legenda. Num editor
 * de mapa, quem aperta `r` quer o retângulo DO MAPA. Deixar o nativo ali era uma armadilha
 * silenciosa: a peça sai parecida e se comporta diferente.
 */
export const TECLA_PARA_FERRAMENTA: Array<{ tecla: string; shift: boolean; ferramenta: string }> = [
  { tecla: 's', shift: false, ferramenta: 'sala-mapa' },
  { tecla: 's', shift: true, ferramenta: 'sala-poligono-mapa' },
  { tecla: 'c', shift: false, ferramenta: 'corredor-mapa' },
  { tecla: 'c', shift: true, ferramenta: 'escada-mapa' },
  { tecla: 'm', shift: false, ferramenta: 'muralha-mapa' },
  { tecla: 'm', shift: true, ferramenta: 'torre-mapa' },
  { tecla: 'p', shift: false, ferramenta: 'porta-mapa' },
  { tecla: 'r', shift: false, ferramenta: 'retangulo-mapa' },
]

/** A ferramenta existe NESTE editor? O Canvas monta outra lista e não tem peça de mapa. */
export function ferramentaExiste(editor: Editor, id: string): boolean {
  const filhos = (editor.root as unknown as { children?: Record<string, unknown> }).children
  return Boolean(filhos && id in filhos)
}

/**
 * Qual ferramenta a tecla arma, ou `null`.
 *
 * `ctrl`/`meta`/`alt` derrubam tudo: `Ctrl+S` é salvar e `Ctrl+P` é imprimir em qualquer
 * programa, e roubar essas combinações para colocar uma sala no mapa seria pior que não ter
 * atalho.
 */
export function ferramentaDaTecla(evento: {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}): string | null {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return null
  const tecla = evento.key.toLowerCase()
  const achado = TECLA_PARA_FERRAMENTA.find((a) => a.tecla === tecla && a.shift === evento.shiftKey)
  return achado ? achado.ferramenta : null
}

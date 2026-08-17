import {
  Editor,
  createTLStore,
  defaultBindingUtils,
  defaultShapeTools,
  defaultTools,
  type TLPointerEventInfo,
} from 'tldraw'
import { SHAPE_UTILS_DO_STORE_MAPA, TOOLS_CUSTOM_MAPA } from '../lib/montagemMapa'

/**
 * Editor de mapa HEADLESS para teste, com os mesmos `shapeUtils`/`tools` que o `MapaView`
 * monta — a única diferença é não haver `<Tldraw>` em volta.
 *
 * `<Tldraw>` não sobe em jsdom (`image.decode is not a function`, ver
 * `canvasDocIdentidadeShapeUtils.test.tsx`), mas o `Editor` sozinho sobe: ele é lógica de
 * store + máquina de estados, e só toca no DOM através do container que recebe aqui. É o
 * mesmo caminho que a suíte do próprio tldraw usa (`TestEditor`).
 *
 * Sem isso, ordem de empilhamento, camadas e ferramentas só seriam testáveis como funções
 * puras — e o defeito que o usuário viu não estava nas funções puras, estava na LIGAÇÃO
 * entre elas e o editor.
 */
/**
 * Ferramentas como o `<Tldraw>` monta: as nossas SUBSTITUEM a nativa de mesmo `id`
 * (`eraser` pela borracha de trecho, `line` pela linha que coloca no clique) e as demais
 * entram inteiras. O componente faz essa fusão sozinho antes de construir o `Editor`; o
 * construtor cru, não — ele recusa duas ferramentas com o mesmo id ("Can't override tool
 * with id ..."), que é justamente a prova de que a substituição por id existe e funciona.
 */
function ferramentasDoMapa() {
  const idsSubstituidos = new Set(TOOLS_CUSTOM_MAPA.map((t) => t.id))
  const nativas = [...defaultTools, ...defaultShapeTools].filter((t) => !idsSubstituidos.has(t.id))
  return [...nativas, ...TOOLS_CUSTOM_MAPA]
}

export function criarEditorDeTeste(): Editor {
  const store = createTLStore({ shapeUtils: SHAPE_UTILS_DO_STORE_MAPA, bindingUtils: defaultBindingUtils })
  const container = document.createElement('div')
  document.body.appendChild(container)
  return new Editor({
    store,
    shapeUtils: SHAPE_UTILS_DO_STORE_MAPA,
    bindingUtils: defaultBindingUtils,
    tools: ferramentasDoMapa(),
    getContainer: () => container,
  })
}

/**
 * Eventos de ponteiro no formato que a máquina de estados do tldraw espera — mesma forma
 * do `TestEditor` da própria biblioteca (`node_modules/tldraw/src/test/TestEditor.ts`,
 * `getPointerEventInfo`), incluindo o `forceTick` depois de cada envio: sem o tick, o
 * editor não processa a fila e o estado não avança.
 *
 * Câmera parada em 0,0 com zoom 1 no editor recém-criado, então ponto de tela = ponto de
 * página; os testes escrevem coordenadas de página direto.
 */
function eventoDePonteiro(x: number, y: number, nome: string): TLPointerEventInfo {
  return {
    name: nome,
    type: 'pointer',
    pointerId: 1,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    accelKey: false,
    point: { x, y },
    button: 0,
    isPen: false,
    target: 'canvas',
  } as TLPointerEventInfo
}

function enviar(editor: Editor, x: number, y: number, nome: string) {
  editor.dispatch(eventoDePonteiro(x, y, nome))
  editor.emit('tick', 16)
}

/** Clique sem arrasto: o gesto que deixava a linha "grudada na mão". */
export function clicar(editor: Editor, x: number, y: number) {
  enviar(editor, x, y, 'pointer_down')
  enviar(editor, x, y, 'pointer_up')
}

/** Arrasto de verdade: com movimento suficiente para passar do limiar de drag do tldraw. */
export function arrastar(editor: Editor, x1: number, y1: number, x2: number, y2: number) {
  enviar(editor, x1, y1, 'pointer_down')
  enviar(editor, x2, y2, 'pointer_move')
  enviar(editor, x2, y2, 'pointer_up')
}

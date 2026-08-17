import { atom, type Editor, type TLShapeId, type TLShapePartial } from 'tldraw'
import { CANTO_PADRAO, type CantoMapa } from './cantosMapa'

/**
 * Canto escolhido na barra ("Reto" / "Arredondado") para as PRÓXIMAS peças de desenho, e a
 * aplicação dele nas peças já existentes. Um `atom` do tldraw por editor, guardado num
 * `WeakMap`.
 *
 * Por que não `useState` no `MapaToolbar`: a barra é montada pelo `<Tldraw>` no slot
 * `components.Toolbar`, e quem PRECISA ler a escolha é o handler de criação registrado lá
 * no `MapaView` (`registrarBeforeCreateMapa`) — dois pontos da árvore sem prop entre eles.
 * Por que não `editor.updateInstanceState`: o estado de instância do tldraw é validado por
 * um schema fechado, campo novo é rejeitado.
 *
 * `WeakMap` por editor, e não uma variável de módulo, porque dois mapas abertos ao mesmo
 * tempo (ou o mapa e a bancada `amostra/CenaMapa.tsx`) teriam que compartilhar a escolha —
 * e a chave sumir junto com o editor evita segurar editor descartado na memória.
 *
 * `atom` (e não um valor cru) porque a barra precisa REAGIR: `useValue` acende o botão
 * certo assim que a escolha muda, inclusive quando ela muda pela seleção de outra peça.
 */
const cantoPorEditor = new WeakMap<Editor, ReturnType<typeof atom<CantoMapa>>>()

export function cantoAtivoAtom(editor: Editor): ReturnType<typeof atom<CantoMapa>> {
  const existente = cantoPorEditor.get(editor)
  if (existente) return existente
  const novo = atom<CantoMapa>('mapa-canto-ativo', CANTO_PADRAO)
  cantoPorEditor.set(editor, novo)
  return novo
}

export function getCantoAtivo(editor: Editor): CantoMapa {
  return cantoAtivoAtom(editor).get()
}

export function setCantoAtivo(editor: Editor, canto: CantoMapa): void {
  cantoAtivoAtom(editor).set(canto)
}

/**
 * Aplica o canto nas peças de desenho dadas. Guarda em lugares diferentes por imposição do
 * tldraw, não por escolha: `line` é tipo NATIVO e não aceita prop nova (o schema do store
 * recusa — ver `LinhaMapaColoridaShapeUtil`), então vai em `meta.cantos`; o retângulo é
 * peça própria e guarda em `props.cantos`. Peça sem canto (sala, porta, símbolo…) é
 * ignorada em silêncio: o mesmo botão serve à seleção inteira sem exigir que ela seja
 * homogênea.
 *
 * Devolve quantas peças mudaram — os testes usam; a UI ignora.
 */
export function aplicarCanto(editor: Editor, ids: readonly TLShapeId[], canto: CantoMapa): number {
  const mudancas: TLShapePartial[] = []
  for (const id of ids) {
    const shape = editor.getShape(id)
    if (!shape) continue
    if (shape.type === 'line') {
      mudancas.push({ id, type: shape.type, meta: { ...shape.meta, cantos: canto } } as TLShapePartial)
    } else if (shape.type === 'retangulo-mapa') {
      mudancas.push({ id, type: shape.type, props: { cantos: canto } } as TLShapePartial)
    }
  }
  if (mudancas.length) editor.updateShapes(mudancas)
  return mudancas.length
}

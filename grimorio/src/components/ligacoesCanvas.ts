/**
 * Ligação de cards no canvas: cria/detecta setas entre entidades por vínculo ou por
 * hierarquia de cenário. Agnóstico a como o card chegou ali (drop, transformação de
 * imagem etc.) — quem chama decide o gatilho, este módulo só sabe ligar.
 */
import { createShapeId, toRichText, type Editor, type TLShapeId } from 'tldraw'
import type { PastaCenarioNode, Vinculo } from '../lib/types'
import type { CharacterCardShapeType } from './CharacterCardShape'
import type { CenarioCardShapeType } from './CenarioCardShape'
import type { ItemCardShapeType } from './ItemCardShape'
import { paresParaLigar } from '../lib/ligacaoCenario'
import { agruparPorPar } from '../lib/vinculos'

// Âncora comum aos dois terminais da seta de hierarquia (centro do card, sem snap).
const ANCORA_SETA = { normalizedAnchor: { x: 0.5, y: 0.5 }, isPrecise: false, isExact: false, snap: 'none' } as const

/** True se já existe uma seta ligando os shapes `a` e `b` (qualquer direção). */
function existeSetaEntre(editor: Editor, a: TLShapeId, b: TLShapeId): boolean {
  for (const bind of editor.getBindingsToShape(a, 'arrow')) {
    const bindsDoArrow = editor.getBindingsFromShape(bind.fromId, 'arrow')
    if (bindsDoArrow.some((x) => x.toId === b)) return true
  }
  return false
}

/** Cria uma seta de→para com bindings (segue os cards); rótulo opcional no meio. */
function criarSeta(editor: Editor, deShape: TLShapeId, paraShape: TLShapeId, rotulo?: string) {
  const arrowId = createShapeId()
  editor.createShape({
    id: arrowId,
    type: 'arrow',
    x: 0,
    y: 0,
    ...(rotulo ? { props: { richText: toRichText(rotulo) } } : {}),
  })
  editor.createBindings([
    { type: 'arrow', fromId: arrowId, toId: deShape, props: { terminal: 'start', ...ANCORA_SETA } },
    { type: 'arrow', fromId: arrowId, toId: paraShape, props: { terminal: 'end', ...ANCORA_SETA } },
  ])
}

/** Shapes de card por id de entidade. Supõe que UUIDs das três entidades não colidem. */
export function cardsPorEntidade(editor: Editor): Map<string, TLShapeId[]> {
  const mapa = new Map<string, TLShapeId[]>()
  for (const s of editor.getCurrentPageShapes()) {
    let eid: string | null = null
    if (s.type === 'cenario-card') eid = (s as CenarioCardShapeType).props.cenarioId
    else if (s.type === 'character-card') eid = (s as CharacterCardShapeType).props.personagemId
    else if (s.type === 'item-card') eid = (s as ItemCardShapeType).props.itemId
    if (!eid) continue
    const lista = mapa.get(eid) ?? []
    lista.push(s.id)
    mapa.set(eid, lista)
  }
  return mapa
}

/** Liga o cenário recém-dropado aos cards de pai/filhos já presentes no canvas. */
export function ligarCenarioNoCanvas(
  editor: Editor,
  cards: Map<string, TLShapeId[]>,
  raiz: PastaCenarioNode,
  cenarioId: string,
) {
  for (const { paiId, filhoId } of paresParaLigar(raiz, cenarioId)) {
    for (const ps of cards.get(paiId) ?? []) {
      for (const fs of cards.get(filhoId) ?? []) {
        if (!existeSetaEntre(editor, ps, fs)) criarSeta(editor, ps, fs)
      }
    }
  }
}

/**
 * Liga a entidade recém-dropada aos cards presentes com relação direta.
 * Uma seta por par (de → para do primeiro vínculo); múltiplos tipos viram "a · b".
 */
export function ligarRelacoesNoCanvas(
  editor: Editor,
  cards: Map<string, TLShapeId[]>,
  vinculos: Vinculo[],
  entidadeId: string,
) {
  // Defesa p/ call sites futuros: sem card da própria entidade, não há o que ligar.
  if (!cards.has(entidadeId)) return
  for (const { deId, paraId, tipos } of agruparPorPar(vinculos, entidadeId)) {
    for (const ds of cards.get(deId) ?? []) {
      for (const ps of cards.get(paraId) ?? []) {
        if (!existeSetaEntre(editor, ds, ps)) criarSeta(editor, ds, ps, tipos.join(' · '))
      }
    }
  }
}

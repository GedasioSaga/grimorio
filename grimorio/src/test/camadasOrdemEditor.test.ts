// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createShapeId, sortByIndex, type Editor, type TLShapeId } from 'tldraw'
import { criarEditorDeTeste } from './ajudaEditorMapa'
import { normalizarOrdemMapa, registrarBeforeCreateMapa } from '../lib/montagemMapa'

/**
 * A queixa que originou esta leva: "mesmo que eu coloque uma porta numa camada superior,
 * ela fica como se estivesse abaixo".
 *
 * As funções puras de `ordemMapa.ts` já são testadas em `ordemMapa.test.ts`. O que se prova
 * AQUI é a ligação com o editor de verdade — que o `index` do tldraw realmente muda, que a
 * ordem visível (`getCurrentPageShapesSorted`) obedece, e que mover uma peça de camada
 * reposiciona a peça na pilha em vez de só trocar um rótulo em `meta`.
 */

function idsNaOrdemDeDesenho(editor: Editor): string[] {
  return editor
    .getCurrentPageShapes()
    .sort(sortByIndex)
    .map((s) => (s.meta as Record<string, unknown>).apelido as string)
}

function criarPeca(editor: Editor, apelido: string, tipo: string, camada?: string): TLShapeId {
  const id = createShapeId()
  editor.createShape({
    id,
    type: tipo,
    x: 0,
    y: 0,
    meta: { apelido, ...(camada ? { camada } : {}) },
  } as Parameters<typeof editor.createShape>[0])
  return id
}

describe('ordem de empilhamento com camadas, no editor de verdade', () => {
  it('porta na camada de cima é desenhada DEPOIS da sala da camada de baixo', () => {
    const editor = criarEditorDeTeste()
    criarPeca(editor, 'porta-terreo', 'porta-mapa', 'terreo')
    criarPeca(editor, 'sala-subsolo', 'sala-mapa', 'subsolo')

    normalizarOrdemMapa(editor, ['subsolo', 'terreo'])

    expect(idsNaOrdemDeDesenho(editor)).toEqual(['sala-subsolo', 'porta-terreo'])
  })

  it('camada manda em tudo: sala do térreo cobre porta do subsolo, contra a banda', () => {
    const editor = criarEditorDeTeste()
    criarPeca(editor, 'porta-subsolo', 'porta-mapa', 'subsolo')
    criarPeca(editor, 'sala-terreo', 'sala-mapa', 'terreo')

    normalizarOrdemMapa(editor, ['subsolo', 'terreo'])

    expect(idsNaOrdemDeDesenho(editor)).toEqual(['porta-subsolo', 'sala-terreo'])
  })

  it('subir uma camada reordena as peças dela na hora', () => {
    const editor = criarEditorDeTeste()
    criarPeca(editor, 'sala-a', 'sala-mapa', 'a')
    criarPeca(editor, 'sala-b', 'sala-mapa', 'b')

    normalizarOrdemMapa(editor, ['a', 'b'])
    expect(idsNaOrdemDeDesenho(editor)).toEqual(['sala-a', 'sala-b'])

    // usuário sobe a camada "a" no painel: a pilha inverte
    normalizarOrdemMapa(editor, ['b', 'a'])
    expect(idsNaOrdemDeDesenho(editor)).toEqual(['sala-b', 'sala-a'])
  })

  it('mover a peça de camada muda a altura dela, não só o rótulo em meta', () => {
    const editor = criarEditorDeTeste()
    const salaId = criarPeca(editor, 'sala-fundo', 'sala-mapa', 'fundo')
    criarPeca(editor, 'porta-fundo', 'porta-mapa', 'fundo')
    criarPeca(editor, 'muralha-topo', 'muralha-mapa', 'topo')

    const pilha = ['fundo', 'topo']
    normalizarOrdemMapa(editor, pilha)
    expect(idsNaOrdemDeDesenho(editor)).toEqual(['sala-fundo', 'porta-fundo', 'muralha-topo'])

    // a sala sobe para a camada "topo": passa a ser desenhada acima da porta do fundo,
    // e, DENTRO da camada nova, abaixo da muralha? não — muralha é a banda mais baixa,
    // então a sala fica acima dela.
    const sala = editor.getShape(salaId)!
    editor.updateShape({ id: salaId, type: sala.type, meta: { ...sala.meta, camada: 'topo' } } as Parameters<
      typeof editor.updateShape
    >[0])
    normalizarOrdemMapa(editor, pilha)

    expect(idsNaOrdemDeDesenho(editor)).toEqual(['porta-fundo', 'muralha-topo', 'sala-fundo'])
  })

  it('peça sem camada continua no fundo, sem quebrar mapa antigo', () => {
    const editor = criarEditorDeTeste()
    criarPeca(editor, 'card-antigo', 'character-card')
    criarPeca(editor, 'muralha-nova', 'muralha-mapa', 'topo')

    normalizarOrdemMapa(editor, ['base', 'topo'])

    expect(idsNaOrdemDeDesenho(editor)).toEqual(['card-antigo', 'muralha-nova'])
  })

  /**
   * O cadeado do `PainelCamadas` trava TODOS os shapes da camada, e `editor.updateShapes`
   * descarta em silêncio partial sobre shape travado. Sem `ignoreShapeLock`, travar uma
   * camada desligava o empilhamento dela — as duas primeiras queixas do usuário de volta,
   * agora sem nem a pista de "não funciona", porque a normalização REPORTAVA sucesso.
   */
  it('camada TRAVADA continua obedecendo ao empilhamento', () => {
    const editor = criarEditorDeTeste()
    const a = criarPeca(editor, 'sala-a', 'sala-mapa', 'a')
    const b = criarPeca(editor, 'sala-b', 'sala-mapa', 'b')
    editor.updateShapes([
      { id: a, type: 'sala-mapa', isLocked: true },
      { id: b, type: 'sala-mapa', isLocked: true },
    ] as Parameters<typeof editor.updateShapes>[0])

    normalizarOrdemMapa(editor, ['a', 'b'])
    expect(idsNaOrdemDeDesenho(editor)).toEqual(['sala-a', 'sala-b'])

    // usuário sobe a camada "a" no painel, com as duas travadas
    normalizarOrdemMapa(editor, ['b', 'a'])

    expect(idsNaOrdemDeDesenho(editor)).toEqual(['sala-b', 'sala-a'])
  })

  it('pilha mista (uma camada travada) não deixa dois shapes com o mesmo IndexKey', () => {
    const editor = criarEditorDeTeste()
    criarPeca(editor, 'a', 'sala-mapa', 'c1')
    const travada = criarPeca(editor, 'b', 'sala-mapa', 'c2')
    criarPeca(editor, 'c', 'sala-mapa', 'c3')
    editor.updateShapes([{ id: travada, type: 'sala-mapa', isLocked: true }] as Parameters<
      typeof editor.updateShapes
    >[0])

    normalizarOrdemMapa(editor, ['c1', 'c2', 'c3'])
    normalizarOrdemMapa(editor, ['c3', 'c2', 'c1'])

    const indices = editor.getCurrentPageShapes().map((s) => s.index)
    expect(new Set(indices).size).toBe(indices.length)
    expect(idsNaOrdemDeDesenho(editor)).toEqual(['c', 'b', 'a'])
  })

  /**
   * A ordem é DERIVADA do estado das camadas, não uma edição. Entrando no histórico, um
   * Ctrl+Z depois de qualquer desenho revertia a normalização e devolvia a porta do andar de
   * cima para baixo da sala do de baixo — sem o usuário ter como saber o que aconteceu.
   */
  it('a normalização não entra na pilha de desfazer', () => {
    const editor = criarEditorDeTeste()
    criarPeca(editor, 'porta', 'porta-mapa', 'fundo')
    criarPeca(editor, 'sala', 'sala-mapa', 'topo')
    normalizarOrdemMapa(editor, ['fundo', 'topo'])
    const ordemCorreta = idsNaOrdemDeDesenho(editor)

    // o usuário desenha mais uma peça e se arrepende
    editor.markHistoryStoppingPoint('desenho do usuário')
    criarPeca(editor, 'arrependida', 'simbolo-mapa', 'topo')
    editor.undo()

    // o undo tira SÓ a peça nova; a ordem derivada das camadas fica de pé
    expect(idsNaOrdemDeDesenho(editor)).toEqual(ordemCorreta)
  })

  it('peça nova nasce na altura da própria camada, sem precisar de normalização depois', () => {
    const editor = criarEditorDeTeste()
    let camadaAtiva = 'topo'
    const cancelar = registrarBeforeCreateMapa(editor, {
      getCamadaAtivaId: () => camadaAtiva,
      getCamadaTravada: () => false,
      getOrdemCamadas: () => ['fundo', 'topo'],
    })

    // uma muralha (banda mais BAIXA) na camada de cima
    criarPeca(editor, 'muralha-topo', 'muralha-mapa')
    // e um card (banda mais ALTA) na camada de baixo, criado DEPOIS
    camadaAtiva = 'fundo'
    criarPeca(editor, 'card-fundo', 'character-card')

    expect(idsNaOrdemDeDesenho(editor)).toEqual(['card-fundo', 'muralha-topo'])
    cancelar()
  })
})

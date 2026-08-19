// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import { criarEditorDeTeste } from './ajudaEditorMapa'
import {
  lerVinculo,
  registrarAncoraDePortas,
  reposicionarPortaAncorada,
  vaosPorAresta,
} from '../lib/ancoraPortaEditor'
import { trechosSemVao } from '../lib/ancoraPorta'

/**
 * Porta que se ancora na parede — contra editor de verdade.
 *
 * A conta pura está em `ancoraPorta.test.ts`; aqui se prova a LIGAÇÃO: que a porta encontra a
 * parede na página, assume o ângulo dela, guarda o vínculo e sobrevive quando o cômodo muda.
 */
function cena() {
  const editor = criarEditorDeTeste()
  const sala = createShapeId()
  editor.createShape({ id: sala, type: 'sala-mapa', x: 0, y: 0, props: { w: 320, h: 224 } } as Parameters<
    typeof editor.createShape
  >[0])
  return { editor, sala }
}

function porta(editor: Editor, x: number, y: number): TLShapeId {
  const id = createShapeId()
  editor.createShape({ id, type: 'porta-mapa', x, y, props: { w: 40, h: 8 } } as Parameters<
    typeof editor.createShape
  >[0])
  return id
}

/** Aplica o que o `onTranslateEnd` da porta faria, sem simular o arrasto inteiro. */
function soltar(editor: Editor, id: TLShapeId) {
  const forma = editor.getShape(id)!
  const util = editor.getShapeUtil(forma) as {
    onTranslateEnd?: (a: typeof forma, b: typeof forma) => unknown
  }
  const mudanca = util.onTranslateEnd!(forma, forma) as Record<string, unknown> | undefined
  if (mudanca) editor.updateShape(mudanca as Parameters<typeof editor.updateShape>[0])
}

describe('a porta acha a parede', () => {
  it('encosta na parede de cima e fica horizontal', () => {
    const { editor } = cena()
    const p = porta(editor, 140, 6)
    soltar(editor, p)

    const forma = editor.getShape(p)!
    expect(lerVinculo(forma)?.indiceAresta).toBe(0)
    expect(forma.rotation).toBeCloseTo(0, 5)
    const b = editor.getShapePageBounds(p)!
    expect(b.y + b.h / 2).toBeCloseTo(0, 1)
  })

  it('parede VERTICAL orienta a porta sozinha — nenhum gesto de rotação', () => {
    // era o gesto 2 de 3 que a porta custava: girar à mão para acertar o eixo
    const { editor } = cena()
    const p = porta(editor, 314, 100)
    soltar(editor, p)

    const forma = editor.getShape(p)!
    expect(lerVinculo(forma)?.indiceAresta).toBe(1)
    expect(Math.abs(forma.rotation)).toBeCloseTo(Math.PI / 2, 5)
  })

  it('longe de qualquer parede fica SOLTA, sem vínculo', () => {
    const { editor } = cena()
    const p = porta(editor, 900, 900)
    soltar(editor, p)
    expect(lerVinculo(editor.getShape(p)!)).toBeNull()
  })

  it('arrastar para longe LIMPA o vínculo antigo', () => {
    // sem isso a porta continuaria pertencendo à parede velha e voltaria para lá no primeiro
    // redimensionamento do cômodo, parecendo teleporte
    const { editor } = cena()
    const p = porta(editor, 140, 6)
    soltar(editor, p)
    expect(lerVinculo(editor.getShape(p)!)).not.toBeNull()

    editor.updateShape({ id: p, type: 'porta-mapa', x: 900, y: 900 } as Parameters<
      typeof editor.updateShape
    >[0])
    soltar(editor, p)
    expect(lerVinculo(editor.getShape(p)!)).toBeNull()
  })
})

describe('o vínculo sobrevive à parede mudando', () => {
  it('cômodo redimensionado: a porta acompanha, na mesma fração', () => {
    const { editor, sala } = cena()
    const p = porta(editor, 80, 6)
    soltar(editor, p)
    const t = lerVinculo(editor.getShape(p)!)!.t

    editor.updateShape({ id: sala, type: 'sala-mapa', props: { w: 640 } } as Parameters<
      typeof editor.updateShape
    >[0])
    const pose = reposicionarPortaAncorada(editor, editor.getShape(p)!)
    expect(typeof pose).toBe('object')
    if (typeof pose === 'object' && pose) {
      editor.updateShape({ id: p, type: 'porta-mapa', ...pose } as Parameters<typeof editor.updateShape>[0])
    }
    const b = editor.getShapePageBounds(p)!
    // guardar `t` e não coordenada: a porta fica no mesmo ponto RELATIVO da parede maior
    expect((b.x + b.w / 2) / 640).toBeCloseTo(t, 2)
  })

  it('hospedeiro apagado: DESANCORA com aviso, não some com a porta', () => {
    // é a armadilha pela qual o editor de referência é criticado: lá, editar a parede
    // apaga as portas instaladas nela.
    const { editor, sala } = cena()
    const p = porta(editor, 140, 6)
    soltar(editor, p)
    editor.deleteShapes([sala])

    expect(reposicionarPortaAncorada(editor, editor.getShape(p)!)).toBe('sem-hospedeiro')
    expect(editor.getShape(p)).toBeDefined()
  })

  it('aresta que sumiu (vértice removido) também desancora em vez de apagar', () => {
    const editor = criarEditorDeTeste()
    const pol = createShapeId()
    editor.createShape({
      id: pol,
      type: 'sala-poligono-mapa',
      x: 0,
      y: 0,
      props: {
        pontos: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 200 },
          { x: 100, y: 260 },
          { x: 0, y: 200 },
        ],
      },
    } as Parameters<typeof editor.createShape>[0])
    const p = porta(editor, 140, 250)
    editor.updateShape({
      id: p,
      type: 'porta-mapa',
      meta: { ancora: { hospedeiroId: pol, indiceAresta: 3, t: 0.5 } },
    } as Parameters<typeof editor.updateShape>[0])

    editor.updateShape({
      id: pol,
      type: 'sala-poligono-mapa',
      props: {
        pontos: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 0, y: 200 },
        ],
      },
    } as Parameters<typeof editor.updateShape>[0])

    expect(reposicionarPortaAncorada(editor, editor.getShape(p)!)).toBe('sem-aresta')
    expect(editor.getShape(p)).toBeDefined()
  })
})

describe('a porta abre vão no contorno', () => {
  it('a parede hospedeira ganha um vão do tamanho da porta', () => {
    const { editor, sala } = cena()
    const p = porta(editor, 140, 6)
    soltar(editor, p)

    const naArestaDeCima = vaosPorAresta(editor, sala).get(0)!
    expect(naArestaDeCima).toHaveLength(1)
    // porta de 40px numa parede de 320px = 12,5% do comprimento
    expect(naArestaDeCima[0].fim - naArestaDeCima[0].inicio).toBeCloseTo(40 / 320, 3)
    expect(trechosSemVao(naArestaDeCima)).toHaveLength(2)
  })

  it('parede sem porta continua inteira', () => {
    const { editor, sala } = cena()
    porta(editor, 140, 6)
    expect(vaosPorAresta(editor, sala).get(2)).toBeUndefined()
    expect(trechosSemVao([])).toEqual([{ inicio: 0, fim: 1 }])
  })

  it('duas portas na mesma parede abrem dois vãos', () => {
    const { editor, sala } = cena()
    soltar(editor, porta(editor, 60, 6))
    soltar(editor, porta(editor, 240, 6))
    expect(vaosPorAresta(editor, sala).get(0)).toHaveLength(2)
    expect(trechosSemVao(vaosPorAresta(editor, sala).get(0)!)).toHaveLength(3)
  })
})

describe('a porta SEGUE a parede — o side effect', () => {
  /**
   * O critério que separa vínculo real de encaixe cosmético. Sem o side effect a porta
   * encaixa bonito no drop e fica para trás no primeiro gesto seguinte, que é justamente o
   * que um mestre faz o tempo todo: mover o cômodo, esticar, reformar.
   */
  function cenaComAncoras() {
    const { editor, sala } = cena()
    const cancelar = registrarAncoraDePortas(editor)
    const p = porta(editor, 80, 6)
    soltar(editor, p)
    return { editor, sala, p, cancelar }
  }

  const centro = (editor: Editor, id: TLShapeId) => {
    const b = editor.getShapePageBounds(id)!
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }

  it('mover o cômodo leva a porta junto', () => {
    const { editor, sala, p, cancelar } = cenaComAncoras()
    const antes = centro(editor, p)

    editor.updateShape({ id: sala, type: 'sala-mapa', x: 160, y: 96 } as Parameters<
      typeof editor.updateShape
    >[0])

    const depois = centro(editor, p)
    expect(depois.x - antes.x).toBeCloseTo(160, 1)
    expect(depois.y - antes.y).toBeCloseTo(96, 1)
    cancelar()
  })

  it('esticar o cômodo mantém a porta na mesma FRAÇÃO da parede', () => {
    const { editor, sala, p, cancelar } = cenaComAncoras()
    const t = lerVinculo(editor.getShape(p)!)!.t

    editor.updateShape({ id: sala, type: 'sala-mapa', props: { w: 640 } } as Parameters<
      typeof editor.updateShape
    >[0])

    expect(centro(editor, p).x / 640).toBeCloseTo(t, 2)
    cancelar()
  })

  it('trocar só a COR da sala não mexe em porta nenhuma', () => {
    // o guard de geometria existe para isto: sem ele, pintar uma sala reposicionaria todas
    // as portas dela sem motivo, a cada clique de cor.
    const { editor, sala, p, cancelar } = cenaComAncoras()
    const antes = centro(editor, p)
    editor.updateShape({ id: sala, type: 'sala-mapa', props: { cor: '#8a4340' } } as Parameters<
      typeof editor.updateShape
    >[0])
    expect(centro(editor, p)).toEqual(antes)
    cancelar()
  })

  it('reposicionar porta NÃO entra no histórico', () => {
    // se entrasse, desfazer o movimento da sala exigiria um Ctrl+Z por porta antes
    const { editor, sala, p, cancelar } = cenaComAncoras()
    const antes = centro(editor, p)

    editor.markHistoryStoppingPoint('mover-sala')
    editor.updateShape({ id: sala, type: 'sala-mapa', x: 160 } as Parameters<
      typeof editor.updateShape
    >[0])
    expect(centro(editor, p).x).not.toBeCloseTo(antes.x, 1)

    editor.undo()
    // um único undo devolve sala E porta ao lugar
    expect(editor.getShape(sala)!.x).toBe(0)
    expect(centro(editor, p).x).toBeCloseTo(antes.x, 1)
    cancelar()
  })

  it('porta SOLTA não é arrastada pela sala', () => {
    const { editor, sala, cancelar } = cenaComAncoras()
    const solta = porta(editor, 900, 900)
    soltar(editor, solta)
    const antes = centro(editor, solta)

    editor.updateShape({ id: sala, type: 'sala-mapa', x: 160 } as Parameters<
      typeof editor.updateShape
    >[0])

    expect(centro(editor, solta)).toEqual(antes)
    cancelar()
  })
})

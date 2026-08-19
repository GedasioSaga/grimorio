// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import { criarEditorDeTeste } from './ajudaEditorMapa'
import { usePainelPropriedadesMapa } from '../lib/montagemMapa'
import { PainelPropriedades, type SelecaoPropriedades } from '../components/PainelPropriedades'
import { desenharCorpoSalaPoligono } from '../lib/desenhoSalaPoligono'
import { corDeForma } from '../lib/coresLinha'
import { TIPOS_SALA, ehTipoSala } from '../lib/tiposSala'
import { QUADRADO_PX } from '../lib/quadrados'
import { ESPESSURA_CONTORNO_SALA } from '../lib/salaMapa'
import { PONTOS_SALA_POLIGONO_PADRAO, limitesDoPoligono, pontosDeRetangulo } from '../lib/salaPoligonoMapa'

/**
 * PARIDADE ENTRE OS DOIS FORMATOS DE SALA.
 *
 * A sala em polígono nasceu com `estado`, `rotulo` e `cor` nas props e nenhuma superfície
 * capaz de escrever nelas: painel, handlers, conta-gotas e drop comparavam contra o literal
 * `'sala-mapa'`. Ler o código não pega isso — cada arquivo, sozinho, parece correto; o que
 * estava errado era a AUSÊNCIA de um caso, e ausência não dá erro de compilação.
 *
 * Por isso os testes abaixo iteram sobre `TIPOS_SALA` em vez de checar um tipo por vez:
 * o dia em que um terceiro formato de sala entrar na lista, ele entra nesta suíte junto,
 * e a peça inerte aparece como falha em vez de aparecer como queixa do usuário.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Monta o hook de ações e devolve o objeto vivo — mesmo padrão de `camadasAcoesEditor`. */
function montarAcoes(editor: Editor) {
  const caixa: { atual: ReturnType<typeof usePainelPropriedadesMapa> } = {
    atual: null as unknown as ReturnType<typeof usePainelPropriedadesMapa>,
  }
  function Sonda() {
    caixa.atual = usePainelPropriedadesMapa({ current: editor })
    return null
  }
  act(() => root.render(<Sonda />))
  return caixa
}

function criarSala(editor: Editor, tipo: string): TLShapeId {
  const id = createShapeId()
  editor.createShape({ id, type: tipo, x: 0, y: 0 } as Parameters<typeof editor.createShape>[0])
  return id
}

function props(editor: Editor, id: TLShapeId): Record<string, unknown> {
  return (editor.getShape(id)?.props ?? {}) as Record<string, unknown>
}

/** Marca SVG de um trecho puro de desenho, para inspecionar atributo sem montar o editor. */
function renderParaSvg(no: ReactNode): string {
  const alvo = document.createElement('div')
  const raiz = createRoot(alvo)
  act(() => raiz.render(<svg>{no}</svg>))
  const marca = alvo.innerHTML
  act(() => raiz.unmount())
  return marca
}

describe.each(TIPOS_SALA)('handlers do painel aplicam em %s', (tipo) => {
  it('troca o estado', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, tipo)

    act(() => acoes.atual.aoTrocarEstado(id, 'limpa'))

    expect(props(editor, id).estado).toBe('limpa')
  })

  it('renomeia o cômodo', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, tipo)

    act(() => acoes.atual.aoRenomearSala(id, 'Cripta Inundada'))

    expect(props(editor, id).rotulo).toBe('Cripta Inundada')
  })

  it('troca a cor à mão e volta para a cor do estado', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, tipo)

    act(() => acoes.atual.aoTrocarCor(id, '#8a4340'))
    expect(props(editor, id).cor).toBe('#8a4340')

    // o botão "auto" manda string vazia: sem este caminho a sala fica presa na cor escolhida
    act(() => acoes.atual.aoTrocarCor(id, ''))
    expect(props(editor, id).cor).toBe('')
  })

  it('vincula e desvincula um cenário', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, tipo)

    act(() => acoes.atual.aoVincularCenario(id, 'cen-123'))
    expect(props(editor, id).cenarioId).toBe('cen-123')

    act(() => acoes.atual.aoVincularCenario(id, ''))
    expect(props(editor, id).cenarioId).toBe('')
  })

  it('troca a espessura do contorno, e recusa valor não-positivo', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, tipo)

    expect(props(editor, id).espessura).toBe(ESPESSURA_CONTORNO_SALA)

    act(() => acoes.atual.aoTrocarEspessura(id, 6))
    expect(props(editor, id).espessura).toBe(6)

    // 0 desenharia uma sala sem contorno nenhum, e `T.positiveNumber` recusaria o update
    // com uma exceção no meio do render — o guard tem que barrar antes.
    act(() => acoes.atual.aoTrocarEspessura(id, 0))
    expect(props(editor, id).espessura).toBe(6)
  })

  it('duplo clique é ATENDIDO mesmo sem cenário vinculado', () => {
    const editor = criarEditorDeTeste()
    const id = criarSala(editor, tipo)
    const forma = editor.getShape(id)!
    const util = editor.getShapeUtil(forma) as { onDoubleClick?: (s: typeof forma) => unknown }

    // retorno falsy faz o Idle do SelectTool seguir para `handleDoubleClickOnCanvas`, que
    // cria um shape de texto vazio no ponto — o mapa vai sujando a cada duplo clique.
    expect(util.onDoubleClick).toBeTypeOf('function')
    expect(util.onDoubleClick!(forma)).toBeTruthy()
  })

  it('o conta-gotas consegue ler a cor da peça', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, tipo)
    act(() => acoes.atual.aoTrocarCor(id, '#3f5568'))

    expect(corDeForma(editor.getShape(id)!)).toBe('#3f5568')
  })
})

describe('campos L/A do painel', () => {
  it.each(TIPOS_SALA)('%s muda de largura de verdade', (tipo) => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, tipo)
    const antes = editor.getShapePageBounds(id)!.w

    const alvoQuadrados = Math.round((antes * 2) / QUADRADO_PX)
    act(() => acoes.atual.aoAplicarL(id, alvoQuadrados))

    const depois = editor.getShapePageBounds(id)!.w
    // O polígono não tinha `onResize`, e `Editor.resizeShape` é guardado por
    // `if (util.onResize && util.canResize(shape))` — saía em silêncio. O campo aceitava o
    // número, o valor voltava sozinho e nenhum erro aparecia em lugar nenhum.
    expect(depois).toBeCloseTo(alvoQuadrados * QUADRADO_PX, 1)
    expect(depois).not.toBeCloseTo(antes, 1)
  })

  it('polígono redimensionado mantém a contagem de vértices', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, 'sala-poligono-mapa')

    act(() => acoes.atual.aoAplicarA(id, 12))

    const pontos = props(editor, id).pontos as Array<{ x: number; y: number }>
    expect(pontos).toHaveLength(PONTOS_SALA_POLIGONO_PADRAO.length)
    expect(pontos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })
})

describe('painel desenha os mesmos controles para os dois formatos', () => {
  function selecaoDe(tipoShape: string): SelecaoPropriedades {
    return {
      tipo: 'single',
      id: 'shape:x' as TLShapeId,
      x: 0,
      y: 0,
      w: 160,
      h: 112,
      tipoShape,
      estado: 'sem-info',
      rotuloSala: '',
      cor: '',
      cenarioId: '',
      espessura: ESPESSURA_CONTORNO_SALA,
      camadasDaSelecao: [],
    }
  }

  function textoDoPainel(tipoShape: string): string {
    const vazio = () => {}
    act(() =>
      root.render(
        <PainelPropriedades
          selecao={selecaoDe(tipoShape)}
          aoAplicarX={vazio}
          aoAplicarY={vazio}
          aoAplicarL={vazio}
          aoAplicarA={vazio}
          aoTrocarEstado={vazio}
          aoRenomearSala={vazio}
          aoTrocarCor={vazio}
          aoVincularCenario={vazio}
          aoTrocarCorLinha={vazio}
          pegandoCorLinhaId={null}
          aoIniciarContaGotasLinha={vazio}
          aoTrocarCantos={vazio}
          aoTrocarEspessura={vazio}
          aoTrocarPreenchido={vazio}
          aoTrocarEstiloRotulo={vazio}
          aoTrocarContorno={vazio}
        />,
      ),
    )
    return container.textContent ?? ''
  }

  it.each(TIPOS_SALA)('%s mostra nome, estado, cor, contorno e cenário', (tipo) => {
    const texto = textoDoPainel(tipo)
    for (const rotulo of ['Nome do cômodo', 'Estado', 'Cor', 'Contorno', 'Cenário vinculado']) {
      expect(texto).toContain(rotulo)
    }
  })
})

describe('desenho do polígono', () => {
  it('polígono degenerado cai na forma de nascença, sem NaN e sem sumir', () => {
    // Antes este teste esperava `null` — "não desenha nada". Estava certo sobre o NaN e
    // errado sobre o remédio: peça invisível o mestre nunca acha para consertar. Agora a
    // peça aparece como o L de nascença, ele vê que está torta e arrasta os vértices.
    for (const pontos of [[], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }]]) {
      const marca = renderParaSvg(desenharCorpoSalaPoligono({ pontos, estado: 'sem-info', rotulo: 'X', cor: '' }))
      expect(marca).toContain('<polygon')
      expect(marca).not.toContain('NaN')
      expect(marca).not.toContain('Infinity')
    }
  })

  it('vértice com coordenada não-finita também cai na forma de nascença', () => {
    // JSON de IA torto não erra só na CONTAGEM de vértices; erra no valor. `NaN`/`Infinity`
    // num ponto contamina bounds, centroide e todo atributo derivado deles.
    const podres = [
      [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 10, y: 10 }],
      [{ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }, { x: 10, y: 10 }],
    ]
    for (const pontos of podres) {
      const marca = renderParaSvg(desenharCorpoSalaPoligono({ pontos, estado: 'sem-info', rotulo: 'X', cor: '' }))
      expect(marca).not.toContain('NaN')
      expect(marca).not.toContain('Infinity')
    }
  })

  it('`getGeometry` do shape sobrevive a polígono degenerado — é ele que roda ao ler o disco', () => {
    const editor = criarEditorDeTeste()
    const id = createShapeId()
    editor.createShape({ id, type: 'sala-poligono-mapa', x: 0, y: 0 } as Parameters<typeof editor.createShape>[0])
    // grava direto no store o que uma planta de IA torta gravaria
    editor.updateShape({ id, type: 'sala-poligono-mapa', props: { pontos: [] } } as Parameters<
      typeof editor.updateShape
    >[0])

    // `new Polygon2d({ points: [] })` LANÇA. Sem o guard, o erro sobe de `getGeometry` ao
    // abrir o documento e derruba o mapa inteiro no LimiteDeErro — não é a peça que some.
    expect(() => editor.getShapeGeometry(id)).not.toThrow()
    const b = editor.getShapePageBounds(id)!
    expect(Number.isFinite(b.w) && b.w > 0).toBe(true)
    expect(Number.isFinite(b.h) && b.h > 0).toBe(true)
  })

  it('a espessura escolhida chega ao contorno, e 0 cai no padrão', () => {
    const comEspessura = desenharCorpoSalaPoligono({
      pontos: PONTOS_SALA_POLIGONO_PADRAO,
      estado: 'sem-info',
      rotulo: '',
      cor: '',
      espessura: 6,
    })
    expect(renderParaSvg(comEspessura)).toContain('stroke-width="6"')

    const semEspessura = desenharCorpoSalaPoligono({
      pontos: PONTOS_SALA_POLIGONO_PADRAO,
      estado: 'sem-info',
      rotulo: '',
      cor: '',
      espessura: 0,
    })
    expect(renderParaSvg(semEspessura)).toContain(`stroke-width="${ESPESSURA_CONTORNO_SALA}"`)
  })

  it('desenha o badge de vínculo, igual à sala retangular', () => {
    const vinculado = desenharCorpoSalaPoligono({
      pontos: PONTOS_SALA_POLIGONO_PADRAO,
      estado: 'sem-info',
      rotulo: '',
      cor: '',
      vinculo: { estado: 'vinculado', nomeCenario: 'Cripta' },
    })
    expect(renderParaSvg(vinculado)).toContain('🔗')

    const quebrado = desenharCorpoSalaPoligono({
      pontos: PONTOS_SALA_POLIGONO_PADRAO,
      estado: 'sem-info',
      rotulo: '',
      cor: '',
      vinculo: { estado: 'quebrado', nomeCenario: null },
    })
    expect(renderParaSvg(quebrado)).toContain('⚠')
  })

  it('retângulo convertido vira quatro cantos no mesmo espaço', () => {
    const pontos = pontosDeRetangulo(320, 128)
    expect(pontos).toHaveLength(4)
    const { w, h } = limitesDoPoligono(pontos)
    // o cômodo convertido tem que ocupar EXATAMENTE o espaço da forma velha; qualquer
    // desvio aqui é a peça pulando de lugar na frente do usuário no momento da conversão.
    expect(w).toBe(320)
    expect(h).toBe(128)
    expect(pontos[0]).toEqual({ x: 0, y: 0 })
  })

  it('`ehTipoSala` reconhece os dois formatos e recusa o resto', () => {
    expect(ehTipoSala('sala-mapa')).toBe(true)
    expect(ehTipoSala('sala-poligono-mapa')).toBe(true)
    expect(ehTipoSala('retangulo-mapa')).toBe(false)
    expect(ehTipoSala('porta-mapa')).toBe(false)
    expect(ehTipoSala(undefined)).toBe(false)
  })
})

/**
 * Os três defeitos de CONSTRUÇÃO que a auditoria confirmou fora do eixo de paridade.
 * Cada um passou despercebido porque o código lia certo — o que estava errado era a relação
 * entre duas peças (caixa × origem, desenho × hit-test, rascunho × blur).
 */
describe('mover pelos campos X/Y', () => {
  it('Enter sem mudar o valor NÃO desloca a peça', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, 'sala-poligono-mapa')

    // vértice arrastado para a esquerda: a origem do shape deixa de coincidir com a caixa,
    // que é a condição em que o handler antigo empurrava a peça a cada Enter.
    act(() =>
      editor.updateShape({
        id,
        type: 'sala-poligono-mapa',
        props: { pontos: [{ x: -60, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 180 }, { x: -60, y: 180 }] },
      } as Parameters<typeof editor.updateShape>[0]),
    )

    const antes = editor.getShapePageBounds(id)!
    const xQuadrados = antes.x / QUADRADO_PX
    act(() => acoes.atual.aoAplicarX(id, xQuadrados))
    act(() => acoes.atual.aoAplicarX(id, xQuadrados))

    const depois = editor.getShapePageBounds(id)!
    expect(depois.x).toBeCloseTo(antes.x, 1)
    expect(depois.y).toBeCloseTo(antes.y, 1)
  })

  it('mexer em X não move a peça em Y', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, 'sala-poligono-mapa')
    act(() =>
      editor.updateShape({
        id,
        type: 'sala-poligono-mapa',
        props: { pontos: [{ x: 0, y: -40 }, { x: 200, y: -40 }, { x: 200, y: 120 }, { x: 0, y: 120 }] },
      } as Parameters<typeof editor.updateShape>[0]),
    )

    const antes = editor.getShapePageBounds(id)!
    act(() => acoes.atual.aoAplicarX(id, antes.x / QUADRADO_PX + 3))

    const depois = editor.getShapePageBounds(id)!
    expect(depois.x).toBeCloseTo(antes.x + 3 * QUADRADO_PX, 1)
    expect(depois.y).toBeCloseTo(antes.y, 1)
  })

  it('a peça vai para onde o campo pede', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, 'sala-mapa')

    act(() => acoes.atual.aoAplicarX(id, 7))
    act(() => acoes.atual.aoAplicarY(id, 4))

    const b = editor.getShapePageBounds(id)!
    expect(b.x).toBeCloseTo(7 * QUADRADO_PX, 1)
    expect(b.y).toBeCloseTo(4 * QUADRADO_PX, 1)
  })
})

describe('retângulo do mapa e o clique', () => {
  it('vazado deixa o clique passar; preenchido captura', () => {
    const editor = criarEditorDeTeste()
    const sala = criarSala(editor, 'sala-mapa')
    const moldura = createShapeId()
    // moldura grande por cima da sala, nascida depois (topo da mesma banda)
    editor.createShape({
      id: moldura,
      type: 'retangulo-mapa',
      x: -20,
      y: -20,
      props: { w: 400, h: 400, preenchido: false },
    } as Parameters<typeof editor.createShape>[0])

    const dentro = { x: 40, y: 40 }
    // vazado: o miolo não é alvo, então quem responde é a sala embaixo
    expect(editor.getShapeAtPoint(dentro, { hitInside: true })?.id).toBe(sala)

    act(() =>
      editor.updateShape({ id: moldura, type: 'retangulo-mapa', props: { preenchido: true } } as Parameters<
        typeof editor.updateShape
      >[0]),
    )
    expect(editor.getShapeAtPoint(dentro, { hitInside: true })?.id).toBe(moldura)
  })
})

describe('torre e o clique no canto da muralha', () => {
  it('o canto da caixa da torre NÃO é a torre — quem responde é a peça embaixo', () => {
    const editor = criarEditorDeTeste()
    // muralha larga, e a torre sobreposta ao canto dela: a configuração que `torreMapa.ts`
    // documenta como a única em que a torre é usada.
    const muralha = createShapeId()
    editor.createShape({ id: muralha, type: 'muralha-mapa', x: 0, y: 0, props: { w: 400, h: 90 } } as Parameters<
      typeof editor.createShape
    >[0])
    const torre = createShapeId()
    editor.createShape({ id: torre, type: 'torre-mapa', x: 0, y: 0, props: { w: 90, h: 90 } } as Parameters<
      typeof editor.createShape
    >[0])

    // ponto a 4px do canto superior-esquerdo: dentro da CAIXA da torre, fora do círculo.
    // São 21% da área da caixa (1 − π/4), e caem em cima da parede.
    expect(editor.getShapeAtPoint({ x: 4, y: 4 }, { hitInside: true })?.id).toBe(muralha)

    // o miolo continua sendo a torre: ela é um cômodo redondo preenchido, não um anel
    expect(editor.getShapeAtPoint({ x: 45, y: 45 }, { hitInside: true })?.id).toBe(torre)
  })

  it('a torre continua clicável nos quatro cantos do próprio círculo', () => {
    const editor = criarEditorDeTeste()
    const torre = createShapeId()
    editor.createShape({ id: torre, type: 'torre-mapa', x: 0, y: 0, props: { w: 90, h: 90 } } as Parameters<
      typeof editor.createShape
    >[0])
    for (const p of [
      { x: 45, y: 6 },
      { x: 84, y: 45 },
      { x: 45, y: 84 },
      { x: 6, y: 45 },
    ]) {
      expect(editor.getShapeAtPoint(p, { hitInside: true })?.id, `ponto ${p.x},${p.y}`).toBe(torre)
    }
  })
})

describe('desfazer edição do painel', () => {
  /**
   * Cada ajuste no painel tem que ser UM passo de histórico.
   *
   * Sem marca explícita, o tldraw junta escritas próximas no mesmo passo: o mestre troca
   * estado, cor e nome de um cômodo, se arrepende do nome, aperta Ctrl+Z — e perde os três.
   * Como o desfazer parece "não ter funcionado" (o nome voltou, mas a cor também), ele
   * aperta de novo e desmonta mais. `markHistoryStoppingPoint` não aparecia uma única vez
   * no projeto inteiro.
   */
  it('três ajustes = três Ctrl+Z, um de cada vez', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, 'sala-mapa')
    const p = () => props(editor, id)

    act(() => acoes.atual.aoTrocarEstado(id, 'limpa'))
    act(() => acoes.atual.aoTrocarCor(id, '#8a4340'))
    act(() => acoes.atual.aoRenomearSala(id, 'Cripta'))
    expect([p().estado, p().cor, p().rotulo]).toEqual(['limpa', '#8a4340', 'Cripta'])

    act(() => void editor.undo())
    expect(p().rotulo, 'o 1o Ctrl+Z desfaz o NOME').toBe('')
    expect(p().cor, 'e nao pode levar a cor junto').toBe('#8a4340')
    expect(p().estado).toBe('limpa')

    act(() => void editor.undo())
    expect(p().cor, 'o 2o Ctrl+Z desfaz a COR').toBe('')
    expect(p().estado).toBe('limpa')

    act(() => void editor.undo())
    expect(p().estado, 'o 3o Ctrl+Z desfaz o ESTADO').toBe('sem-info')
  })

  it('refazer devolve na mesma granularidade', () => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, 'sala-mapa')
    const p = () => props(editor, id)

    act(() => acoes.atual.aoTrocarEstado(id, 'limpa'))
    act(() => acoes.atual.aoTrocarCor(id, '#8a4340'))
    act(() => void editor.undo())
    act(() => void editor.redo())

    expect(p().cor).toBe('#8a4340')
    expect(p().estado).toBe('limpa')
  })
})

describe('contorno da sala pode ser desligado', () => {
  /**
   * Compor planta com salas SOBREPOSTAS é legítimo — salão grande de fundo, cômodos por cima
   * — e cada encosto deixava traço duplo. A tentativa anterior foi dissolver a parede
   * automaticamente onde duas peças de massa se tocavam; ela apagou o contorno de plantas
   * inteiras em que a sobreposição era de propósito, e foi revertida. Quem decide qual linha
   * sobra é o mestre.
   */
  it.each(TIPOS_SALA)('%s nasce COM contorno', (tipo) => {
    const editor = criarEditorDeTeste()
    const id = criarSala(editor, tipo)
    expect(props(editor, id).contorno).toBe(true)
  })

  it.each(TIPOS_SALA)('%s liga e desliga pelo painel', (tipo) => {
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, tipo)

    act(() => acoes.atual.aoTrocarContorno(id, false))
    expect(props(editor, id).contorno).toBe(false)

    act(() => acoes.atual.aoTrocarContorno(id, true))
    expect(props(editor, id).contorno).toBe(true)
  })

  it('desligado, o SVG sai sem traço — e o piso continua lá', () => {
    const comLinha = renderParaSvg(
      desenharCorpoSalaPoligono({ pontos: PONTOS_SALA_POLIGONO_PADRAO, estado: 'sem-info', rotulo: '', cor: '' }),
    )
    expect(comLinha).toContain('stroke-width="2"')

    const semLinha = renderParaSvg(
      desenharCorpoSalaPoligono({
        pontos: PONTOS_SALA_POLIGONO_PADRAO,
        estado: 'sem-info',
        rotulo: '',
        cor: '',
        contorno: false,
      }),
    )
    expect(semLinha).toContain('stroke-width="0"')
    // a mancha de piso é o que sobra: sem ela a peça sumiria da tela
    expect(semLinha).toContain('<polygon')
    expect(semLinha).toContain('fill=')
  })

  it('escolher uma espessura RELIGA o contorno', () => {
    // exigir dois cliques para voltar a ver a linha seria pegadinha
    const editor = criarEditorDeTeste()
    const acoes = montarAcoes(editor)
    const id = criarSala(editor, 'sala-mapa')

    act(() => acoes.atual.aoTrocarContorno(id, false))
    act(() => {
      acoes.atual.aoTrocarContorno(id, true)
      acoes.atual.aoTrocarEspessura(id, 6)
    })

    expect(props(editor, id).contorno).toBe(true)
    expect(props(editor, id).espessura).toBe(6)
  })
})

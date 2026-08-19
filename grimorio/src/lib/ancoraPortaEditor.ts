import type { Editor, TLShape, TLShapeId } from 'tldraw'
import {
  arestasDeCaixa,
  arestasDePoligono,
  melhorAncora,
  reprojetarAncora,
  type Ancoragem,
  type Aresta,
  type HospedeiroCandidato,
  type Ponto,
} from './ancoraPorta'
import { pontosSeguros } from './salaPoligonoMapa'
import { TIPOS_MASSA, trechosCobertos } from './fusaoParedes'

/**
 * A metade que conversa com o editor: quais peças podem hospedar porta, como extrair as
 * arestas delas e onde o vínculo é guardado. A conta pura mora em `ancoraPorta.ts`.
 */

/**
 * Peças em que uma porta faz sentido: as que TÊM parede.
 *
 * Torre e escada ficam de fora por motivos diferentes. A torre é redonda — encostar uma barra
 * reta na circunferência não produz um vão crível, e a conta de arco é outra geometria. A
 * escada é passagem, não barreira: porta em escada não é convenção de planta nenhuma.
 * Retângulo de desenho também fica fora: é anotação livre, não construção.
 */
export const TIPOS_HOSPEDEIROS = new Set([
  'sala-mapa',
  'sala-poligono-mapa',
  'corredor-mapa',
  'muralha-mapa',
])

/**
 * Onde o vínculo mora. `meta`, e não `props`, por dois motivos:
 *
 * 1. `props` exigiria migração de schema na porta e, pior, faria um mapa antigo carregar
 *    campos de ancoragem vazios em toda porta já desenhada.
 * 2. o vínculo é uma RELAÇÃO entre duas peças, não um atributo da porta — a mesma natureza de
 *    `meta.camada` e `meta.corPersonalizada`, que o projeto já guarda assim.
 */
export interface VinculoAncora {
  hospedeiroId: string
  indiceAresta: number
  /** fração ao longo da aresta; sobrevive a mover e redimensionar a parede */
  t: number
}

export function lerVinculo(shape: TLShape | undefined): VinculoAncora | null {
  const meta = (shape?.meta ?? {}) as Record<string, unknown>
  const bruto = meta.ancora as Partial<VinculoAncora> | undefined
  if (!bruto || typeof bruto.hospedeiroId !== 'string') return null
  if (typeof bruto.indiceAresta !== 'number' || typeof bruto.t !== 'number') return null
  return { hospedeiroId: bruto.hospedeiroId, indiceAresta: bruto.indiceAresta, t: bruto.t }
}

/** Arestas da peça em espaço LOCAL dela. Peça que não hospeda devolve lista vazia. */
export function arestasLocais(shape: TLShape): Aresta[] {
  const props = shape.props as Record<string, unknown>
  if (shape.type === 'sala-poligono-mapa') {
    return arestasDePoligono(pontosSeguros(props.pontos as Ponto[]))
  }
  if (TIPOS_HOSPEDEIROS.has(shape.type)) {
    const w = typeof props.w === 'number' ? props.w : 0
    const h = typeof props.h === 'number' ? props.h : 0
    if (w <= 0 || h <= 0) return []
    return arestasDeCaixa(w, h)
  }
  return []
}

/** As mesmas arestas, levadas para espaço de PÁGINA — é onde a porta é comparada. */
export function arestasEmPagina(editor: Editor, shape: TLShape): Aresta[] {
  const transform = editor.getShapePageTransform(shape.id)
  if (!transform) return []
  return arestasLocais(shape).map((aresta) => ({
    a: transform.applyToPoint(aresta.a),
    b: transform.applyToPoint(aresta.b),
  }))
}

/**
 * Candidatos a hospedeiro na página, exceto a própria porta.
 *
 * Peça OCULTA fica de fora: ancorar numa parede que o mestre escondeu produziria uma porta
 * que salta para o nada e um vão numa camada que ninguém está vendo. Peça travada continua
 * valendo — travar é sobre não mover a peça, não sobre proibir que outra encoste nela.
 */
export function hospedeirosCandidatos(editor: Editor, exceto: TLShapeId): HospedeiroCandidato[] {
  return editor
    .getCurrentPageShapes()
    .filter((s) => s.id !== exceto && TIPOS_HOSPEDEIROS.has(s.type) && !editor.isShapeHidden(s))
    .map((s) => ({ id: s.id, arestas: arestasEmPagina(editor, s) }))
    .filter((c) => c.arestas.length > 0)
}

/** Alcance do encaixe em px de TELA, dividido pelo zoom para valer igual em qualquer zoom. */
export const ALCANCE_ANCORA_PX = 22

export function alcanceEmPagina(editor: Editor): number {
  return ALCANCE_ANCORA_PX / editor.getZoomLevel()
}

/**
 * A ancoragem que a porta assumiria se fosse solta agora — ou `null` para "fica solta".
 *
 * O ponto consultado é o CENTRO da porta, não o canto: encostar pelo canto faria a peça
 * grudar deslocada meia largura, e o mestre corrigiria à mão exatamente o gesto que a
 * ancoragem existe para eliminar.
 */
export function ancoraParaPorta(editor: Editor, porta: TLShape): Ancoragem | null {
  const bounds = editor.getShapePageBounds(porta.id)
  if (!bounds) return null
  const centro = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
  return melhorAncora(centro, hospedeirosCandidatos(editor, porta.id), alcanceEmPagina(editor))
}

/**
 * Traduz uma ancoragem no `x`/`y`/`rotation` que a porta deve assumir.
 *
 * `x`/`y` são o CANTO da porta em espaço do pai, então o centro dela precisa ser recuado por
 * metade da largura e da altura JÁ ROTACIONADAS — recuar antes de girar põe a porta fora da
 * parede em qualquer ângulo que não seja múltiplo de 90°.
 */
export function poseDaAncora(
  editor: Editor,
  porta: TLShape,
  ancora: Ancoragem,
): { x: number; y: number; rotation: number } | null {
  const props = porta.props as { w?: number; h?: number }
  const w = typeof props.w === 'number' ? props.w : 0
  const h = typeof props.h === 'number' ? props.h : 0

  const cos = Math.cos(ancora.angulo)
  const sen = Math.sin(ancora.angulo)
  const meio = { x: (w / 2) * cos - (h / 2) * sen, y: (w / 2) * sen + (h / 2) * cos }
  const cantoPagina = { x: ancora.ponto.x - meio.x, y: ancora.ponto.y - meio.y }

  const local = editor.getPointInParentSpace(porta.id, cantoPagina)
  return { x: local.x, y: local.y, rotation: ancora.angulo }
}

/**
 * Reposiciona uma porta ancorada depois que o hospedeiro mudou.
 *
 * Devolve `'sem-hospedeiro'` quando a peça sumiu e `'sem-aresta'` quando ela existe mas
 * encolheu de vértices — os dois casos em que o app DESANCORA com aviso em vez de apagar a
 * porta. É o inverso do editor de referência, onde editar a parede leva as portas junto.
 */
export function reposicionarPortaAncorada(
  editor: Editor,
  porta: TLShape,
): { x: number; y: number; rotation: number } | 'sem-hospedeiro' | 'sem-aresta' | null {
  const vinculo = lerVinculo(porta)
  if (!vinculo) return null

  const hospedeiro = editor.getShape(vinculo.hospedeiroId as TLShapeId)
  if (!hospedeiro) return 'sem-hospedeiro'

  const alvo = reprojetarAncora(arestasEmPagina(editor, hospedeiro), vinculo.indiceAresta, vinculo.t)
  if (!alvo) return 'sem-aresta'

  return poseDaAncora(editor, porta, {
    hospedeiroId: vinculo.hospedeiroId,
    indiceAresta: vinculo.indiceAresta,
    t: vinculo.t,
    ponto: alvo.ponto,
    angulo: alvo.angulo,
    distancia: 0,
  })
}

/**
 * Vãos que as portas ancoradas abrem em cada aresta do hospedeiro, em fração do comprimento.
 *
 * Devolve um mapa `índice da aresta → lista de vãos`, pronto para `trechosSemVao`. É o que o
 * desenho do cômodo consome para interromper o contorno onde há porta — sem isso, a planta
 * afirma parede contínua exatamente onde existe passagem.
 */
export function vaosPorAresta(
  editor: Editor,
  hospedeiroId: TLShapeId,
): Map<number, Array<{ inicio: number; fim: number }>> {
  const saida = new Map<number, Array<{ inicio: number; fim: number }>>()
  const arestas = arestasEmPagina(editor, editor.getShape(hospedeiroId)!)

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'porta-mapa') continue
    const vinculo = lerVinculo(shape)
    if (!vinculo || vinculo.hospedeiroId !== hospedeiroId) continue

    const aresta = arestas[vinculo.indiceAresta]
    if (!aresta) continue
    const comprimento = Math.hypot(aresta.b.x - aresta.a.x, aresta.b.y - aresta.a.y)
    if (comprimento === 0) continue

    const largura = (shape.props as { w?: number }).w ?? 0
    const meio = largura / 2 / comprimento
    const lista = saida.get(vinculo.indiceAresta) ?? []
    lista.push({ inicio: vinculo.t - meio, fim: vinculo.t + meio })
    saida.set(vinculo.indiceAresta, lista)
  }

  return saida
}

/**
 * Faz as portas ancoradas SEGUIREM a parede quando ela muda.
 *
 * Sem isto o vínculo seria cosmético: encaixaria bonito no instante do drop e a porta ficaria
 * para trás no primeiro movimento do cômodo. Mover a sala cinco quadrados, redimensionar de
 * 6×4 para 9×4 ou arrastar um vértice do polígono são as três coisas que um mestre faz o
 * tempo todo, e nas três a porta tem que ir junto — no mesmo `t`, no mesmo lado.
 *
 * `registerAfterChangeHandler` e não `before`: o reposicionamento precisa da geometria NOVA
 * do hospedeiro, que só existe depois da mudança.
 *
 * `source !== 'user'` é ignorado de propósito — a porta deve seguir também quando o
 * hospedeiro se mexe por desfazer, por sincronização ou pela IA. O guard que importa é outro:
 * só reage quando a geometria mudou de verdade (`x`/`y`/`rotation`/`props`), senão trocar a
 * COR de uma sala reposicionaria todas as portas dela sem motivo.
 *
 * A escrita roda dentro de `editor.run(..., { history: 'ignore' })`: reposicionar porta é
 * consequência do gesto do usuário, não um gesto. Se entrasse no histórico, desfazer o
 * movimento da sala exigiria um Ctrl+Z por porta antes de mexer na sala de novo. Mesmo motivo
 * pelo qual a reordenação por camada usa a flag (ver `montagemMapa.tsx`).
 */
export function registrarAncoraDePortas(editor: Editor): () => void {
  return editor.sideEffects.registerAfterChangeHandler('shape', (antes, depois) => {
    if (!TIPOS_HOSPEDEIROS.has(depois.type)) return
    const mudouGeometria =
      antes.x !== depois.x ||
      antes.y !== depois.y ||
      antes.rotation !== depois.rotation ||
      antes.props !== depois.props
    if (!mudouGeometria) return

    const portas = editor.getCurrentPageShapes().filter((s) => {
      if (s.type !== 'porta-mapa') return false
      return lerVinculo(s)?.hospedeiroId === depois.id
    })
    if (portas.length === 0) return

    const mudancas: Array<{ id: TLShapeId; type: string; x: number; y: number; rotation: number }> = []
    for (const porta of portas) {
      const resultado = reposicionarPortaAncorada(editor, porta)
      if (typeof resultado !== 'object' || !resultado) continue
      mudancas.push({ id: porta.id, type: porta.type, ...resultado })
    }
    if (mudancas.length > 0) {
      editor.run(() => editor.updateShapes(mudancas as Parameters<typeof editor.updateShapes>[0]), {
        history: 'ignore',
      })
    }
  })
}

/**
 * Vãos do contorno de uma peça: os das PORTAS ancoradas mais os das peças de massa
 * encostadas nela.
 *
 * As duas fontes entram na mesma lista de propósito. Do ponto de vista do desenho são a mesma
 * coisa — pedaço de parede que não deve existir —, e tratá-las separadamente faria uma porta
 * na junção de dois cômodos ser recortada duas vezes, com o traço entre os dois recortes
 * saindo de comprimento negativo. `fundirIntervalos` resolve, mas só se as duas chegarem
 * juntas.
 *
 * O filtro por caixa antes da geometria não é otimização prematura: sem ele, cada sala testa
 * clipping de polígono contra TODAS as peças da página a cada render, e o custo cresce com o
 * quadrado do tamanho do mapa. Comparar duas caixas é barato e descarta quase tudo.
 */
export function vaosDoContorno(
  editor: Editor,
  pecaId: TLShapeId,
): Map<number, Array<{ inicio: number; fim: number }>> {
  const vaos = vaosPorAresta(editor, pecaId)

  const peca = editor.getShape(pecaId)
  const caixa = editor.getShapePageBounds(pecaId)
  if (!peca || !caixa || !TIPOS_MASSA.has(peca.type)) return vaos

  const arestas = arestasEmPagina(editor, peca)
  if (arestas.length === 0) return vaos

  for (const vizinha of editor.getCurrentPageShapes()) {
    if (vizinha.id === pecaId) continue
    if (!TIPOS_MASSA.has(vizinha.type)) continue
    // peça escondida não deve dissolver parede: some da tela e leva a parede junto,
    // deixando o cômodo aberto para um vizinho que ninguém está vendo.
    if (editor.isShapeHidden(vizinha)) continue

    const caixaVizinha = editor.getShapePageBounds(vizinha.id)
    // sobreposição de caixas com 1px de folga — a folga é o que faz "encostada" contar,
    // já que duas paredes coladas têm caixas que se tocam sem se invadir.
    if (
      !caixaVizinha ||
      caixaVizinha.x > caixa.x + caixa.w + 1 ||
      caixaVizinha.x + caixaVizinha.w < caixa.x - 1 ||
      caixaVizinha.y > caixa.y + caixa.h + 1 ||
      caixaVizinha.y + caixaVizinha.h < caixa.y - 1
    ) {
      continue
    }

    const contorno = arestasEmPagina(editor, vizinha).map((a) => a.a)
    if (contorno.length < 3) continue

    arestas.forEach((aresta, indice) => {
      const cobertos = trechosCobertos(aresta, contorno)
      if (cobertos.length === 0) return
      vaos.set(indice, [...(vaos.get(indice) ?? []), ...cobertos])
    })
  }

  return vaos
}

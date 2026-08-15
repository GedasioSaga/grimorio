import { useState } from 'react'
import {
  createShapeId,
  toRichText,
  useEditor,
  useValue,
  type Editor,
  type StyleProp,
  type TLGeoShape,
  type TLShapeId,
} from 'tldraw'
import { pecasConversiveis, planoDeConversao } from '../lib/conversaoMapa'
import { entradasDaLegenda, type EntradaLegenda } from '../lib/legendaMapa'
import { ELEMENTOS_PALETA } from '../lib/paletaMapa'
import { tamanhoDoSimbolo } from './SimboloMapaShape'

/**
 * Os dois comandos da leva 4b: converter o que já está desenhado em peça de verdade, e
 * inserir a legenda do mapa.
 *
 * Ficam num componente à parte da `MapaToolbar` porque são AÇÕES SOBRE O MAPA, não
 * escolha de ferramenta — e porque a toolbar já estava no limite de responsabilidade.
 */
export function ComandosMapa({ stylePropsPorNome }: { stylePropsPorNome: Record<string, StyleProp<string>> }) {
  const editor = useEditor()
  const [menuAberto, setMenuAberto] = useState(false)
  const qtdSelecionada = useValue('mapa-comandos-selecao', () => editor.getSelectedShapeIds().length, [editor])

  return (
    <>
      <div className="gaveta-pecas">
        {menuAberto && (
          <div className="gaveta-pecas-grade" role="menu">
            {pecasConversiveis().map((elemento) => (
              <button
                key={elemento.id}
                type="button"
                role="menuitem"
                className="gaveta-pecas-item"
                onClick={() => {
                  converterSelecao(editor, elemento.id, stylePropsPorNome)
                  setMenuAberto(false)
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
          className={`btn-icon${menuAberto ? ' ativo' : ''}`}
          title={
            qtdSelecionada === 0
              ? 'Converter em ▸ (selecione formas antes)'
              : `Converter ${qtdSelecionada} forma(s) em ▸`
          }
          disabled={qtdSelecionada === 0}
          onClick={() => setMenuAberto((a) => !a)}
        >
          Converter ▸
        </button>
      </div>
      <button type="button" className="btn-icon" title="Inserir legenda do mapa" onClick={() => inserirLegenda(editor)}>
        Legenda
      </button>
    </>
  )
}

/**
 * Converte as formas selecionadas na peça escolhida.
 *
 * Dois caminhos, decididos por `planoDeConversao` (lib pura):
 * - `estilo`: a forma continua a mesma e só é repintada. Usa
 *   `editor.setStyleForSelectedShapes` (Editor.ts:8840) em vez de escrever `props` na
 *   mão — é a API que sabe aplicar cada style no tipo certo de forma e ignorar quem não
 *   aceita, o que evita quebrar uma linha ou um desenho que estejam na seleção.
 * - `substituir`: não há como repintar um retângulo até virar losango com "!", então a
 *   forma velha sai e um `simbolo-mapa` nasce ocupando o mesmo espaço.
 */
function converterSelecao(editor: Editor, pecaId: string, stylePropsPorNome: Record<string, StyleProp<string>>) {
  const plano = planoDeConversao(pecaId)
  if (plano.tipo === 'impossivel') return

  const selecionadas = editor.getSelectedShapeIds()
  if (selecionadas.length === 0) return

  editor.run(() => {
    if (plano.tipo === 'estilo') {
      const geoStyle = plano.geo ? stylePropsPorNome.geo : undefined
      if (geoStyle && plano.geo) editor.setStyleForSelectedShapes(geoStyle, plano.geo)
      for (const [nome, valor] of Object.entries(plano.estilos)) {
        const style = stylePropsPorNome[nome]
        if (style) editor.setStyleForSelectedShapes(style, valor)
      }
      editor.updateShapes(
        selecionadas.map((id) => {
          const forma = editor.getShape(id)!
          return { id, type: forma.type, meta: { ...forma.meta, peca: plano.peca } }
        }),
      )
      return
    }

    // substituir: cada forma vira um símbolo desenhado do mesmo tamanho, no mesmo lugar
    const novas: TLShapeId[] = []
    for (const id of selecionadas) {
      const forma = editor.getShape(id)
      const bounds = editor.getShapePageBounds(id)
      if (!forma || !bounds) continue
      const novoId = createShapeId()
      editor.createShape({
        id: novoId,
        type: 'simbolo-mapa',
        x: bounds.x,
        y: bounds.y,
        // a forma antiga pode ter qualquer tamanho; o símbolo assume o espaço dela
        props: { w: bounds.w, h: bounds.h, simbolo: plano.simbolo, rotulo: '' },
        meta: { ...forma.meta, peca: plano.peca },
      })
      novas.push(novoId)
    }
    editor.deleteShapes(selecionadas)
    if (novas.length) editor.setSelectedShapes(novas)
  })
}

/** Medidas do bloco de legenda, em px de página (1 quadrado = 32px). */
const LEGENDA = {
  larguraBloco: 220,
  alturaLinha: 32,
  margemInterna: 16,
  alturaTitulo: 28,
  ladoSimbolo: 20,
} as const

/**
 * Desenha o quadro de legenda no canto de cima à esquerda da tela, listando SÓ os
 * símbolos que o mapa realmente usa (`entradasDaLegenda`, lib pura).
 *
 * O bloco é desenho comum, agrupado: depois de criado o usuário move, edita o texto e
 * apaga linha à vontade — e ele sai no PNG/SVG sem tratamento especial, porque é canvas
 * como qualquer outro. Em troca, não se atualiza sozinho: inserir de novo cria outro
 * quadro.
 */
function inserirLegenda(editor: Editor) {
  const pecasPresentes = editor
    .getCurrentPageShapes()
    .map((s) => (s.meta as Record<string, unknown>).peca)
    .filter((p): p is string => typeof p === 'string')

  const entradas = entradasDaLegenda(pecasPresentes)
  if (entradas.length === 0) return

  const viewport = editor.getViewportPageBounds()
  const x0 = viewport.x + 40
  const y0 = viewport.y + 40
  const altura = LEGENDA.alturaTitulo + entradas.length * LEGENDA.alturaLinha + LEGENDA.margemInterna * 2

  const ids: TLShapeId[] = []
  const criar = (id: TLShapeId, forma: Parameters<Editor['createShape']>[0]) => {
    editor.createShape(forma)
    ids.push(id)
  }

  editor.run(() => {
    // moldura
    const idMoldura = createShapeId()
    criar(idMoldura, {
      id: idMoldura,
      type: 'geo',
      x: x0,
      y: y0,
      props: {
        geo: 'rectangle',
        w: LEGENDA.larguraBloco,
        h: altura,
        color: 'white',
        fill: 'none',
        dash: 'solid',
        size: 's',
      },
    })

    const idTitulo = createShapeId()
    criar(idTitulo, {
      id: idTitulo,
      type: 'text',
      x: x0 + LEGENDA.margemInterna,
      y: y0 + LEGENDA.margemInterna - 4,
      props: { color: 'white', size: 's', richText: toRichText('LEGENDA') },
    })

    entradas.forEach((entrada, i) => {
      const linhaY = y0 + LEGENDA.margemInterna + LEGENDA.alturaTitulo + i * LEGENDA.alturaLinha
      criarAmostra(entrada, x0 + LEGENDA.margemInterna, linhaY, criar)

      const idTexto = createShapeId()
      criar(idTexto, {
        id: idTexto,
        type: 'text',
        x: x0 + LEGENDA.margemInterna + LEGENDA.ladoSimbolo + 12,
        y: linhaY - 2,
        props: { color: 'white', size: 's', richText: toRichText(entrada.rotulo) },
      })
    })

    editor.setCurrentTool('select')
    editor.setSelectedShapes(ids)
    editor.groupShapes(ids)
  })
}

/** A miniatura do símbolo na linha da legenda — o mesmo desenho que aparece no mapa. */
function criarAmostra(
  entrada: EntradaLegenda,
  x: number,
  y: number,
  criar: (id: TLShapeId, forma: Parameters<Editor['createShape']>[0]) => void,
) {
  const id = createShapeId()

  if (entrada.simbolo) {
    const { w, h } = tamanhoDoSimbolo(entrada.simbolo)
    // encolhe mantendo a proporção, pra cama não ficar do tamanho de um baú
    const escala = LEGENDA.ladoSimbolo / Math.max(w, h)
    criar(id, {
      id,
      type: 'simbolo-mapa',
      x,
      y,
      props: { w: w * escala, h: h * escala, simbolo: entrada.simbolo, rotulo: entrada.simbolo === 'marcador' ? '1' : '' },
    })
    return
  }

  // peça de estilo (sala, parede): a amostra é a própria forma, em miniatura
  const elemento = ELEMENTOS_PALETA.find((e) => e.id === entrada.peca)
  criar(id, {
    id,
    type: 'geo',
    x,
    y,
    props: {
      // `ElementoPaleta.geo` é string livre (a lib da paleta não depende do tldraw);
      // aqui ela reencontra o union do tldraw. Valor inválido já é barrado pelo teste
      // da paleta, que confere todo estilo contra o tlschema real.
      geo: (elemento?.geo ?? 'rectangle') as TLGeoShape['props']['geo'],
      w: LEGENDA.ladoSimbolo,
      h: LEGENDA.ladoSimbolo,
      ...elemento?.estilos,
    },
  })
}

import type { Editor, TLImageShape } from 'tldraw'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { relRetratoDoCard, type ShapeMinimo } from '../lib/copiaImagemCard'
import { copiarImagemParaClipboard } from '../lib/copiarImagem'
import type { CharacterCardShapeType } from './CharacterCardShape'
import type { CenarioCardShapeType } from './CenarioCardShape'
import type { ItemCardShapeType } from './ItemCardShape'
import { transformarImagemEmEntidade } from './transformarImagemEmEntidade'
import {
  MINIMO_DE_VERTICES,
  pontosSeguros,
  removerVertice,
  verticeMaisProximo,
  type PontoPoligono,
} from '../lib/salaPoligonoMapa'

/**
 * Atalhos de teclado das superfícies tldraw (canvas e mapa): espaço abre o que está
 * selecionado; Ctrl/Cmd+C copia o retrato do card; Delete perto de um canto da sala em
 * polígono remove aquele canto. Registrado em fase capture no container do editor —
 * dispara antes dos atalhos nativos (espaço = pan do tldraw, Delete = apagar a peça).
 */

/** Raio, em px de TELA, para o Delete acertar um canto. Convertido para página pelo zoom. */
const ALCANCE_VERTICE_PX = 14

/**
 * Delete/Backspace com o cursor perto de um canto da sala em polígono: remove o canto em vez
 * de apagar a sala.
 *
 * Sem isto, um canto a mais só se desfazia apagando o cômodo e desenhando de novo — e junto
 * iam nome, estado, cor e o vínculo com a ficha do Cenário. É a metade que faltava do par:
 * a alça `create` no meio da aresta insere, esta tecla remove.
 *
 * Devolve `true` quando tratou a tecla. Longe de qualquer canto, devolve `false` e o Delete
 * do tldraw segue apagando a peça — trocar isso em toda a área da sala tiraria do usuário um
 * gesto que ele já tem.
 */
function removerCantoSobCursor(editor: Editor): boolean {
  const shape = editor.getOnlySelectedShape()
  if (!shape || shape.type !== 'sala-poligono-mapa') return false

  const pontos = pontosSeguros((shape.props as { pontos: PontoPoligono[] }).pontos)
  if (pontos.length <= MINIMO_DE_VERTICES) return false

  // cursor em espaço LOCAL do shape: os vértices vivem nesse espaço, e comparar contra
  // coordenada de página erraria em qualquer sala movida, girada ou dentro de um grupo.
  const transform = editor.getShapePageTransform(shape.id)
  if (!transform) return false
  const local = transform.clone().invert().applyToPoint(editor.inputs.getCurrentPagePoint())

  // o alcance é em px de tela: sem dividir pelo zoom, mirar num canto exigiria precisão
  // diferente a cada nível de zoom.
  const alcance = ALCANCE_VERTICE_PX / editor.getZoomLevel()
  const indice = verticeMaisProximo(pontos, { x: local.x, y: local.y }, alcance)
  if (indice === null) return false

  const novos = removerVertice(pontos, indice)
  if (novos.length === pontos.length) return false

  editor.markHistoryStoppingPoint('remover-vertice')
  editor.updateShape({ id: shape.id, type: shape.type, props: { pontos: novos } } as Parameters<
    typeof editor.updateShape
  >[0])
  return true
}
export function registrarAtalhos(
  editor: Editor,
  avisos: { aoCopiar(): void; aoFalharCopia(erro: string): void },
): () => void {
  // espaço com um card de personagem selecionado abre o cartão completo
  // (duplo clique no card só expande/recolhe a descrição). Fase capture:
  // dispara antes dos atalhos do tldraw (que usam espaço para o pan).
  const aoTeclar = (e: KeyboardEvent) => {
    // Ctrl/Cmd+C com um card selecionado que tem retrato: copia a IMAGEM (não o
    // shape). Baseia-se na seleção nativa do tldraw — clicar no card já seleciona;
    // o clique na <img> não é confiável dentro do canvas (o tldraw captura o ponteiro).
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      if (editor.getEditingShapeId()) return // editando texto: deixa copiar o texto
      const { personagens, cenarios, itens, vaultPath: vp } = useApp.getState()
      // TLShape → ShapeMinimo: só lemos type/props; o cast evita acoplar o helper ao tldraw
      const rel = relRetratoDoCard(
        editor.getOnlySelectedShape() as unknown as ShapeMinimo | null,
        personagens,
        cenarios,
        itens,
      )
      if (!rel || !vp) return // sem imagem: deixa o Ctrl+C nativo do tldraw agir
      e.preventDefault()
      e.stopPropagation()
      copiarImagemParaClipboard(convertFileSrc(`${vp}/${rel}`))
        .then(() => avisos.aoCopiar())
        .catch((err) => {
          console.error('Falha ao copiar imagem:', err)
          avisos.aoFalharCopia(String(err))
        })
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (editor.getEditingShapeId()) return // editando texto: Delete é do texto
      const alvoTecla = e.target as HTMLElement | null
      if (alvoTecla?.closest('input, textarea, [contenteditable="true"]')) return
      if (removerCantoSobCursor(editor)) {
        e.preventDefault()
        e.stopPropagation()
      }
      return
    }

    if (e.key !== ' ' || e.repeat) return
    if (editor.getEditingShapeId()) return
    const alvo = e.target as HTMLElement | null
    if (alvo?.closest('input, textarea, [contenteditable="true"]')) return
    const shape = editor.getOnlySelectedShape()
    if (!shape) return
    if (shape.type === 'character-card') {
      e.preventDefault()
      e.stopPropagation()
      useApp.getState().abrirPerfil((shape as CharacterCardShapeType).props.personagemId)
    } else if (shape.type === 'cenario-card') {
      e.preventDefault()
      e.stopPropagation()
      useApp.getState().abrirCenario((shape as CenarioCardShapeType).props.cenarioId)
    } else if (shape.type === 'item-card') {
      e.preventDefault()
      e.stopPropagation()
      useApp.getState().abrirItem((shape as ItemCardShapeType).props.itemId)
    } else if (shape.type === 'image') {
      e.preventDefault()
      e.stopPropagation()
      void transformarImagemEmEntidade(editor, shape as TLImageShape)
    }
  }
  const container = editor.getContainer()
  container.addEventListener('keydown', aoTeclar, { capture: true })
  return () => container.removeEventListener('keydown', aoTeclar, { capture: true })
}

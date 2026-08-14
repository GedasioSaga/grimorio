import type { Editor, TLImageShape } from 'tldraw'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { relRetratoDoCard, type ShapeMinimo } from '../lib/copiaImagemCard'
import { copiarImagemParaClipboard } from '../lib/copiarImagem'
import type { CharacterCardShapeType } from './CharacterCardShape'
import type { CenarioCardShapeType } from './CenarioCardShape'
import type { ItemCardShapeType } from './ItemCardShape'
import { transformarImagemEmEntidade } from './transformarImagemEmEntidade'

/**
 * Atalhos de teclado das superfícies tldraw (canvas e mapa): espaço abre o que está
 * selecionado; Ctrl/Cmd+C copia o retrato do card. Registrado em fase capture no
 * container do editor — dispara antes dos atalhos nativos (espaço = pan do tldraw).
 */
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

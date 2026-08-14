import { useRef, useState } from 'react'
import { Tldraw, createShapeId, defaultShapeUtils, type Editor, type TLImageShape } from 'tldraw'
import 'tldraw/tldraw.css'
import { convertFileSrc } from '@tauri-apps/api/core'
import { message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import {
  CARD_ALTURA_PADRAO,
  CARD_LARGURA_PADRAO,
  CharacterCardShapeUtil,
  type CharacterCardShapeType,
} from './CharacterCardShape'
import { CenarioCardShapeUtil, type CenarioCardShapeType } from './CenarioCardShape'
import { ItemCardShapeUtil, type ItemCardShapeType } from './ItemCardShape'
import { relRetratoDoCard, type ShapeMinimo } from '../lib/copiaImagemCard'
import { copiarImagemParaClipboard } from '../lib/copiarImagem'
import { ROTULO_TIPO, destinoRetrato, extensaoDe, sugestaoDeNome } from '../lib/transformarImagem'
import { versaoAtiva } from '../lib/cenarioVersao'
import { versaoAtivaPersonagem } from '../lib/personagemVersao'
import { pedirTexto } from './dialogos'
import { associarEscolhendoCampanhas } from './dialogoCampanhas'
import { pedirTransformacao } from './dialogoTransformar'
import { registrarEditor, desregistrarEditor } from '../lib/canvasAtivo'
import { useDocumentoTldraw } from './canvasDoc'
import { criarHandlersDeDrop } from './dropsDeEntidade'
import { cardsPorEntidade, ligarCenarioNoCanvas, ligarRelacoesNoCanvas } from './ligacoesCanvas'
import { exportarCanvas } from './exportarCanvas'

// Constantes em nível de módulo: arrays recriados a cada render remontam o editor.
// `shapeUtilsCustom` vai na prop `shapeUtils` do <Tldraw> (que soma aos defaults);
// o store precisa do schema completo (defaults + customizados).
const shapeUtilsCustom = [CharacterCardShapeUtil, CenarioCardShapeUtil, ItemCardShapeUtil]
const shapeUtilsDoStore = [...defaultShapeUtils, CharacterCardShapeUtil, CenarioCardShapeUtil, ItemCardShapeUtil]

/**
 * Espaço numa imagem solta: cria a entidade escolhida com a imagem como retrato e
 * troca o shape de imagem pelo card correspondente, no mesmo lugar do canvas.
 * A cópia do arquivo segue o padrão de retrato de cada entidade; a imagem original
 * em imagens-canvas/ fica intocada (outros canvases podem referenciá-la).
 */
async function transformarImagemEmEntidade(editor: Editor, shape: TLImageShape) {
  const { repo, vaultPath } = useApp.getState()
  if (!repo || !vaultPath) return
  const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : null
  const rel = (asset?.meta as { rel?: string } | undefined)?.rel
  if (!rel) {
    await message('Esta imagem não tem arquivo no cofre — não dá para transformar.', {
      title: 'Grimório',
      kind: 'warning',
    })
    return
  }
  const escolha = await pedirTransformacao()
  if (!escolha) return
  const { tipo, dir: dirEscolhido, novaPasta } = escolha
  const nome = await pedirTexto(
    `Nome do ${ROTULO_TIPO[tipo].toLowerCase()}:`,
    sugestaoDeNome(asset?.type === 'image' ? asset.props.name : ''),
    'Criar',
  )
  if (!nome) return

  try {
    // pasta nova só nasce depois do nome confirmado: cancelar não deixa pasta órfã
    const dir = novaPasta ? (await repo.criarPasta(dirEscolhido, novaPasta)).caminho : dirEscolhido
    const ext = extensaoDe(rel)
    const origem = caminhoAbsolutoImagem(vaultPath, rel)
    let entidadeId: string
    let cardTipo: 'character-card' | 'cenario-card' | 'item-card'
    let propId: 'personagemId' | 'cenarioId' | 'itemId'

    if (tipo === 'personagem') {
      const ref = await repo.criarPersonagemEm(dir, nome)
      const p = await repo.lerPersonagem(ref.caminho)
      const destino = destinoRetrato(tipo, { id: ref.id, caminho: ref.caminho, versaoAtivaId: p.versaoAtivaId }, ext)
      await repo.copiarParaCofre(origem, destino)
      versaoAtivaPersonagem(p).retrato = destino
      p.modificadoEm = new Date().toISOString()
      await repo.salvarPersonagem(ref.caminho, p)
      await associarEscolhendoCampanhas('personagem', ref.id, nome, dirEscolhido)
      entidadeId = ref.id
      cardTipo = 'character-card'
      propId = 'personagemId'
    } else if (tipo === 'cenario') {
      const ref = await repo.criarCenarioEm(dir, nome)
      const c = await repo.lerCenario(ref.caminho)
      const destino = destinoRetrato(tipo, { id: ref.id, caminho: ref.caminho, versaoAtivaId: c.versaoAtivaId }, ext)
      await repo.copiarParaCofre(origem, destino)
      versaoAtiva(c).retrato = destino
      c.modificadoEm = new Date().toISOString()
      await repo.salvarCenario(ref.caminho, c)
      await associarEscolhendoCampanhas('cenario', ref.id, nome, dirEscolhido)
      entidadeId = ref.id
      cardTipo = 'cenario-card'
      propId = 'cenarioId'
    } else {
      const ref = await repo.criarItemEm(dir, nome)
      const item = await repo.lerItem(ref.caminho)
      const destino = destinoRetrato(tipo, { id: ref.id, caminho: ref.caminho }, ext)
      await repo.copiarParaCofre(origem, destino)
      item.retrato = destino
      item.modificadoEm = new Date().toISOString()
      await repo.salvarItem(ref.caminho, item)
      await associarEscolhendoCampanhas('item', ref.id, nome, dirEscolhido)
      entidadeId = ref.id
      cardTipo = 'item-card'
      propId = 'itemId'
    }

    // card lê a entidade do cache do store: recarregar ANTES de criar o shape.
    // NÃO reler vínculos aqui: definirCampanhas acabou de atualizá-los em memória
    // com gravação debounced — carregarVinculos() leria o disco ainda velho e
    // apagaria a associação recém-escolhida.
    const app = useApp.getState()
    await app.recarregarArvore()
    if (tipo === 'personagem') await app.carregarPersonagens()
    else if (tipo === 'cenario') await app.carregarCenarios()
    else await app.carregarItens()

    // Batch: remoção da imagem + card + setas viram UM passo de undo.
    editor.run(() => {
      editor.deleteShapes([shape.id])
      editor.createShape({
        id: createShapeId(),
        type: cardTipo,
        x: shape.x + (shape.props.w - CARD_LARGURA_PADRAO) / 2,
        y: shape.y + (shape.props.h - CARD_ALTURA_PADRAO) / 2,
        props: { [propId]: entidadeId },
      })
      const cards = cardsPorEntidade(editor)
      ligarRelacoesNoCanvas(editor, cards, useApp.getState().vinculos, entidadeId)
      if (cardTipo === 'cenario-card') {
        const raiz = useApp.getState().tree?.cenarios
        if (raiz) ligarCenarioNoCanvas(editor, cards, raiz, entidadeId)
      }
    })
  } catch (e) {
    await message(`Falha ao transformar a imagem: ${e}`, { title: 'Grimório', kind: 'error' })
  }
}

export function CanvasView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const { store, erro, salvandoErro } = useDocumentoTldraw(caminho, shapeUtilsDoStore)
  const [copiaOk, setCopiaOk] = useState(false)
  const [copiaErro, setCopiaErro] = useState<string | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const { aoArrastarSobre, aoSoltar } = criarHandlersDeDrop(editorRef, vaultPath)

  async function exportar(formato: 'png' | 'svg') {
    const editor = editorRef.current
    if (!editor || !repo) return
    await exportarCanvas(editor, repo, nome, formato)
  }

  if (erro) {
    return (
      <div className="canvas-erro">
        Não foi possível abrir "{nome}": arquivo com erro.
        <br />
        <code>{erro}</code>
      </div>
    )
  }
  if (!store) return <div className="canvas-carregando">Carregando…</div>

  return (
    <div className="canvas-wrap" onDragOverCapture={aoArrastarSobre} onDropCapture={aoSoltar}>
      <div className="canvas-toolbar">
        <span className="canvas-titulo">{nome}</span>
        <button onClick={() => void exportar('png')}>Exportar PNG</button>
        <button onClick={() => void exportar('svg')}>Exportar SVG</button>
      </div>
      <Tldraw
        store={store}
        shapeUtils={shapeUtilsCustom}
        onMount={(editor) => {
          registrarEditor(editor)
          editorRef.current = editor
          editor.user.updateUserPreferences({ colorScheme: 'dark' })
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
                .then(() => {
                  setCopiaOk(true)
                  setTimeout(() => setCopiaOk(false), 1500)
                })
                .catch((err) => {
                  console.error('Falha ao copiar imagem:', err)
                  setCopiaErro(String(err))
                  setTimeout(() => setCopiaErro(null), 4000)
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
          return () => {
            desregistrarEditor(editor)
            container.removeEventListener('keydown', aoTeclar, { capture: true })
          }
        }}
      />
      <div className="canvas-banners">
        {salvandoErro && (
          <div className="canvas-salvar-erro">Falha ao salvar: {salvandoErro}</div>
        )}
        {copiaOk && <div className="canvas-copia-ok">Imagem copiada</div>}
        {copiaErro && <div className="canvas-salvar-erro">Falha ao copiar: {copiaErro}</div>}
      </div>
    </div>
  )
}

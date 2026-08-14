import { createShapeId, type Editor, type TLImageShape } from 'tldraw'
import { message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { CARD_ALTURA_PADRAO, CARD_LARGURA_PADRAO } from './CharacterCardShape'
import { cardsPorEntidade, ligarCenarioNoCanvas, ligarRelacoesNoCanvas } from './ligacoesCanvas'
import { ROTULO_TIPO, destinoRetrato, extensaoDe, sugestaoDeNome } from '../lib/transformarImagem'
import { versaoAtiva } from '../lib/cenarioVersao'
import { versaoAtivaPersonagem } from '../lib/personagemVersao'
import { pedirTexto } from './dialogos'
import { associarEscolhendoCampanhas } from './dialogoCampanhas'
import { pedirTransformacao } from './dialogoTransformar'

/**
 * Espaço numa imagem solta: cria a entidade escolhida com a imagem como retrato e
 * troca o shape de imagem pelo card correspondente, no mesmo lugar do canvas.
 * A cópia do arquivo segue o padrão de retrato de cada entidade; a imagem original
 * em imagens-canvas/ fica intocada (outros canvases podem referenciá-la).
 */
export async function transformarImagemEmEntidade(editor: Editor, shape: TLImageShape) {
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

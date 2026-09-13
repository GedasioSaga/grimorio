import { createShapeId, isPageId, type Editor, type TLImageShape } from 'tldraw'
import { message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { CARD_ALTURA_PADRAO, CARD_LARGURA_PADRAO } from './CharacterCardShape'
import { cardsPorEntidade, ligarCenarioNoCanvas, ligarRelacoesNoCanvas } from './ligacoesCanvas'
import {
  ROTULO_TIPO,
  destinoRetrato,
  extensaoDe,
  lugarDoCardNaImagem,
  novaVersaoCenarioComRetrato,
  novaVersaoPersonagemComRetrato,
  sugestaoDeNome,
  type TipoTransformacao,
} from '../lib/transformarImagem'
import { versaoAtiva } from '../lib/cenarioVersao'
import { versaoAtivaPersonagem } from '../lib/personagemVersao'
import { pedirTexto, pedirTextoComPrefixo } from './dialogos'
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
  const ext = extensaoDe(rel)
  const origem = caminhoAbsolutoImagem(vaultPath, rel)

  try {
    let entidadeId: string
    let cardTipo: 'character-card' | 'cenario-card' | 'item-card'
    let propId: 'personagemId' | 'cenarioId' | 'itemId'
    let tipo: TipoTransformacao

    if (escolha.modo === 'existente') {
      // Nova transformação numa entidade já criada: clona a versão ativa (nome + retrato
      // novos), sem passar pelo diálogo de pasta — a entidade já mora em algum lugar.
      tipo = escolha.tipo
      const nomeVersao = await pedirTexto(
        'Nome da transformação:',
        sugestaoDeNome(asset?.type === 'image' ? asset.props.name : ''),
        'Criar',
      )
      if (!nomeVersao) return
      // id da versão precisa existir ANTES de copiar o arquivo: destinoRetrato embute o
      // id no nome, e a versão só nasce depois que o arquivo já está no destino final.
      const idVersao = crypto.randomUUID()

      if (tipo === 'personagem') {
        const p = useApp.getState().personagens[escolha.id]
        const caminho = useApp.getState().caminhoPorId[escolha.id]
        if (!p || !caminho) throw new Error(`Personagem "${escolha.id}" não encontrado.`)
        const destino = destinoRetrato('personagem', { id: p.id, caminho, versaoAtivaId: idVersao }, ext)
        await repo.copiarParaCofre(origem, destino)
        const atualizado = novaVersaoPersonagemComRetrato(p, nomeVersao, destino, idVersao)
        atualizado.modificadoEm = new Date().toISOString()
        await repo.salvarPersonagem(caminho, atualizado)
        entidadeId = p.id
        cardTipo = 'character-card'
        propId = 'personagemId'
      } else {
        const c = useApp.getState().cenarios[escolha.id]
        const caminho = useApp.getState().caminhoCenarioPorId[escolha.id]
        if (!c || !caminho) throw new Error(`Cenário "${escolha.id}" não encontrado.`)
        const destino = destinoRetrato('cenario', { id: c.id, caminho, versaoAtivaId: idVersao }, ext)
        await repo.copiarParaCofre(origem, destino)
        const atualizado = novaVersaoCenarioComRetrato(c, nomeVersao, destino, idVersao)
        atualizado.modificadoEm = new Date().toISOString()
        await repo.salvarCenario(caminho, atualizado)
        entidadeId = c.id
        cardTipo = 'cenario-card'
        propId = 'cenarioId'
      }
    } else {
      const { tipo: tipoNovo, dir: dirEscolhido, novaPasta, paiNome } = escolha
      tipo = tipoNovo
      const titulo = `Nome do ${ROTULO_TIPO[tipo].toLowerCase()}:`
      // Subcenário segue a convenção "Pai: Filho" (mesma de CenariosSoltos). Com o pai já
      // escolhido no diálogo anterior, o prefixo entra pronto e o nome do arquivo da imagem
      // cai fora — ele quase nunca é o nome do lugar, e obrigaria a apagar antes de digitar.
      const nome = paiNome
        ? await pedirTextoComPrefixo(titulo, `${paiNome}: `, 'Criar')
        : await pedirTexto(titulo, sugestaoDeNome(asset?.type === 'image' ? asset.props.name : ''), 'Criar')
      if (!nome) return
      // O diálogo já devolve null quando o prefixo volta intocado, mas essa regra mora em
      // dialogos.tsx. Este é o único ponto que sabe qual é o prefixo E cria a entidade, e
      // "Reino de Goa: " é truthy: sem a guarda aqui, bastaria o diálogo mudar de ideia para
      // nascer um cenário com os dois-pontos pendurados. Exigir a parte própria (o que sobra
      // depois de "Pai:") em vez de reescrever o nome mantém o que vai para o disco igual ao
      // que o usuário digitou.
      if (paiNome && !parteProprieDoNome(nome, paiNome)) return
      // pasta nova só nasce depois do nome confirmado: cancelar não deixa pasta órfã
      const dir = novaPasta ? (await repo.criarPasta(dirEscolhido, novaPasta)).caminho : dirEscolhido

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
      // a imagem pode ter sido movida enquanto os diálogos estavam abertos: vale onde ela está agora
      const imagem = editor.getShape<TLImageShape>(shape.id) ?? shape
      const lugar = lugarDoCardNaImagem(imagem, { w: CARD_LARGURA_PADRAO, h: CARD_ALTURA_PADRAO })
      // frame apagado com o diálogo aberto: o card cai na página em vez de o tldraw recusar um pai que sumiu
      const paiExiste = isPageId(lugar.parentId) || Boolean(editor.getShape(lugar.parentId))
      editor.deleteShapes([imagem.id])
      editor.createShape({
        id: createShapeId(),
        type: cardTipo,
        ...lugar,
        parentId: paiExiste ? lugar.parentId : editor.getCurrentPageId(),
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

/**
 * Parte própria de um nome na convenção "Pai: Filho": o que sobra depois de "Pai:", sem
 * espaços nas pontas. "Reino de Goa: " e "Reino de Goa:" dão vazio; um nome que não começa
 * pelo prefixo (o usuário apagou o "Pai: ") é todo ele parte própria.
 */
function parteProprieDoNome(nome: string, paiNome: string): string {
  const prefixo = `${paiNome}:`
  return (nome.startsWith(prefixo) ? nome.slice(prefixo.length) : nome).trim()
}

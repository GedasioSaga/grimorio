// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createShapeId, type Editor, type TLImageShape, type TLShapeId } from 'tldraw'
import { lugarDoCardNaImagem } from '../lib/transformarImagem'

/**
 * Bug relatado: imagem DENTRO de um Frame, transformada em personagem/cenário/item, virava um
 * card em outro ponto do canvas. `x`/`y` de shape filho são relativos ao Frame, e o card era
 * criado na página com esses números. O teste roda o fluxo real num Editor do tldraw de
 * verdade e compara o centro NA PÁGINA — é aí que o usuário vê o card pular.
 */

vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => p, invoke: vi.fn() }))
vi.mock('../components/dialogoTransformar', () => ({
  pedirTransformacao: async () => ({ modo: 'novo', tipo: 'personagem', dir: 'personagens-soltos', novaPasta: null }),
}))
vi.mock('../components/dialogos', () => ({
  pedirTexto: async () => 'Goblin',
  pedirTextoComPrefixo: async () => null,
}))
vi.mock('../components/dialogoCampanhas', () => ({ associarEscolhendoCampanhas: vi.fn(async () => {}) }))
vi.mock('../components/ligacoesCanvas', () => ({
  cardsPorEntidade: () => new Map(),
  ligarRelacoesNoCanvas: vi.fn(),
  ligarCenarioNoCanvas: vi.fn(),
}))

const repo = vi.hoisted(() => ({
  criarPersonagemEm: vi.fn(async () => ({ id: 'p1', caminho: 'personagens-soltos/goblin.json' })),
  lerPersonagem: vi.fn(async () => ({
    id: 'p1', nome: 'Goblin', versaoAtivaId: 'v1',
    versoes: [{ id: 'v1', nome: 'Goblin', retrato: null }],
  })),
  copiarParaCofre: vi.fn(async () => {}),
  salvarPersonagem: vi.fn(async () => {}),
}))
vi.mock('../state/store', async (importOriginal) => {
  const real = await importOriginal<typeof import('../state/store')>()
  real.useApp.setState({
    repo: repo as never,
    vaultPath: 'C:/Cofre',
    vinculos: [],
    tree: null,
    recarregarArvore: async () => {},
    carregarPersonagens: async () => {},
  } as never)
  return real
})

const { criarEditorDeTeste } = await import('./ajudaEditorMapa')
const { transformarImagemEmEntidade } = await import('../components/transformarImagemEmEntidade')

const ASSET = { type: 'image', props: { name: 'goblin.png' }, meta: { rel: 'imagens-canvas/goblin.png' } }

function centroNaPagina(editor: Editor, id: TLShapeId) {
  const b = editor.getShapePageBounds(id)
  if (!b) throw new Error(`shape ${id} sem bounds`)
  return { x: b.midX, y: b.midY }
}

function montar(frame: { x: number; y: number; rotation?: number }, imagem: { x: number; y: number; rotation?: number }) {
  const editor = criarEditorDeTeste()
  vi.spyOn(editor, 'getAsset').mockReturnValue(ASSET as never)
  const frameId = createShapeId('frame')
  const imagemId = createShapeId('imagem')
  editor.createShape({ id: frameId, type: 'frame', x: frame.x, y: frame.y, rotation: frame.rotation ?? 0, props: { w: 1200, h: 900 } })
  editor.createShape({
    id: imagemId, type: 'image', parentId: frameId,
    x: imagem.x, y: imagem.y, rotation: imagem.rotation ?? 0,
    props: { w: 400, h: 300, assetId: 'asset:goblin' as never },
  })
  return { editor, frameId, imagemId }
}

function cardCriado(editor: Editor) {
  const card = editor.getCurrentPageShapes().find((s) => s.type === 'character-card')
  if (!card) throw new Error('o fluxo não criou o card')
  return card
}

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockClear()
})

describe('transformar imagem dentro de um Frame', () => {
  it('o card nasce dentro do mesmo Frame, com o centro onde a imagem estava', async () => {
    const { editor, frameId, imagemId } = montar({ x: 2000, y: 1500 }, { x: 150, y: 90 })
    const antes = centroNaPagina(editor, imagemId)

    await transformarImagemEmEntidade(editor, editor.getShape<TLImageShape>(imagemId)!)

    const card = cardCriado(editor)
    expect(editor.getShape(imagemId)).toBeUndefined()
    expect(card.parentId).toBe(frameId)
    const depois = centroNaPagina(editor, card.id)
    expect(depois.x).toBeCloseTo(antes.x, 6)
    expect(depois.y).toBeCloseTo(antes.y, 6)
  })

  it('Frame girado: o centro na página continua o mesmo', async () => {
    const { editor, imagemId } = montar({ x: 800, y: 300, rotation: Math.PI / 6 }, { x: 200, y: 120 })
    const antes = centroNaPagina(editor, imagemId)

    await transformarImagemEmEntidade(editor, editor.getShape<TLImageShape>(imagemId)!)

    const depois = centroNaPagina(editor, cardCriado(editor).id)
    expect(depois.x).toBeCloseTo(antes.x, 6)
    expect(depois.y).toBeCloseTo(antes.y, 6)
  })

  it('imagem movida enquanto o diálogo estava aberto: vale a posição de agora', async () => {
    const { editor, imagemId } = montar({ x: 500, y: 500 }, { x: 10, y: 10 })
    const velha = editor.getShape<TLImageShape>(imagemId)!
    editor.updateShape({ id: imagemId, type: 'image', x: 600, y: 400 })
    const antes = centroNaPagina(editor, imagemId)

    await transformarImagemEmEntidade(editor, velha)

    const depois = centroNaPagina(editor, cardCriado(editor).id)
    expect(depois.x).toBeCloseTo(antes.x, 6)
    expect(depois.y).toBeCloseTo(antes.y, 6)
  })

  it('imagem solta na página continua funcionando como antes', async () => {
    const editor = criarEditorDeTeste()
    vi.spyOn(editor, 'getAsset').mockReturnValue(ASSET as never)
    const imagemId = createShapeId('solta')
    editor.createShape({ id: imagemId, type: 'image', x: 300, y: 200, props: { w: 400, h: 300, assetId: 'asset:goblin' as never } })
    const antes = centroNaPagina(editor, imagemId)

    await transformarImagemEmEntidade(editor, editor.getShape<TLImageShape>(imagemId)!)

    const card = cardCriado(editor)
    expect(card.parentId).toBe(editor.getCurrentPageId())
    const depois = centroNaPagina(editor, card.id)
    expect(depois.x).toBeCloseTo(antes.x, 6)
    expect(depois.y).toBeCloseTo(antes.y, 6)
  })
})

describe('lugarDoCardNaImagem', () => {
  it('sem rotação: centraliza o card no retângulo da imagem, no espaço do pai', () => {
    const lugar = lugarDoCardNaImagem({ parentId: 'shape:f', x: 100, y: 50, rotation: 0, props: { w: 400, h: 300 } }, { w: 240, h: 320 })
    expect(lugar).toEqual({ parentId: 'shape:f', x: 100 + 200 - 120, y: 50 + 150 - 160 })
  })

  it('imagem girada 90°: o centro gira em volta do canto x/y', () => {
    const lugar = lugarDoCardNaImagem({ parentId: 'page:p', x: 0, y: 0, rotation: Math.PI / 2, props: { w: 400, h: 300 } }, { w: 0, h: 0 })
    // (200, 150) girado 90° em volta da origem = (-150, 200)
    expect(lugar.x).toBeCloseTo(-150, 9)
    expect(lugar.y).toBeCloseTo(200, 9)
  })
})

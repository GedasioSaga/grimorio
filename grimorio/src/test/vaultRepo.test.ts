import { beforeEach, describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { VaultRepo } from '../lib/vaultRepo'

let fs: ReturnType<typeof criarFakeFs>
let repo: VaultRepo

beforeEach(() => {
  fs = criarFakeFs()
  repo = new VaultRepo('C:/Cofre', fs)
})

describe('VaultRepo', () => {
  it('inicializa estrutura do cofre', async () => {
    await repo.inicializar()
    expect(await fs.exists('C:/Cofre/campanhas')).toBe(true)
    expect(await fs.exists('C:/Cofre/canvases-soltos')).toBe(true)
  })

  it('cria campanha com estrutura e meta', async () => {
    await repo.inicializar()
    const slug = await repo.criarCampanha('A Maldição de Strahd')
    expect(slug).toBe('a-maldicao-de-strahd')
    const meta = JSON.parse(await fs.readText('C:/Cofre/campanhas/a-maldicao-de-strahd/campanha.json'))
    expect(meta.nome).toBe('A Maldição de Strahd')
  })

  it('cria personagem e lê de volta', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    expect(p.nome).toBe('Baldur')
    expect(p.id).toBeTruthy()
  })

  it('salva e recarrega personagem preservando id', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    p.resumo = 'taverneiro'
    await repo.salvarPersonagem(ref.caminho, p)
    const p2 = await repo.lerPersonagem(ref.caminho)
    expect(p2.resumo).toBe('taverneiro')
    expect(p2.id).toBe(p.id)
  })

  it('cria sessão e canvas solto', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const s = await repo.criarCanvasDoc(`campanhas/${camp}/sessoes`, 'Sessão 01')
    const c = await repo.criarCanvasDoc('canvases-soltos', 'Rabisco')
    expect(s.caminho).toBe('campanhas/teste/sessoes/sessao-01.json')
    expect(c.caminho).toBe('canvases-soltos/rabisco.json')
  })

  it('monta árvore do cofre', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    await repo.criarPersonagem(camp, 'Baldur')
    await repo.criarCanvasDoc(`campanhas/${camp}/sessoes`, 'Sessão 01')
    await repo.criarCanvasDoc('canvases-soltos', 'Rabisco')
    const tree = await repo.montarArvore()
    expect(tree.campanhas).toHaveLength(1)
    expect(tree.campanhas[0].personagens[0].nome).toBe('Baldur')
    expect(tree.campanhas[0].sessoes[0].nome).toBe('Sessão 01')
    expect(tree.canvasesSoltos[0].nome).toBe('Rabisco')
  })

  it('arquivo corrompido vira item com erro, sem derrubar a árvore', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    await fs.writeTextAtomic(`C:/Cofre/campanhas/${camp}/personagens/quebrado.json`, '{nao é json')
    const tree = await repo.montarArvore()
    const quebrado = tree.campanhas[0].personagens.find((p) => p.slug === 'quebrado')
    expect(quebrado?.erro).toBe(true)
  })

  it('nomes duplicados ganham sufixo', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const a = await repo.criarPersonagem(camp, 'Baldur')
    const b = await repo.criarPersonagem(camp, 'Baldur')
    expect(a.slug).toBe('baldur')
    expect(b.slug).toBe('baldur-2')
  })

  it('renomeia item (muda campo nome, mantém arquivo)', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    await repo.renomearItem(ref.caminho, 'Baldur, o Sábio')
    const p = await repo.lerPersonagem(ref.caminho)
    expect(p.nome).toBe('Baldur, o Sábio')
  })

  it('exclui item', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    await repo.excluirItem(ref.caminho)
    expect(await fs.exists(`C:/Cofre/${ref.caminho}`)).toBe(false)
  })
})

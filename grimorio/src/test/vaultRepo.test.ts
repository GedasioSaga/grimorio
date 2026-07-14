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

  it('cria personagem já no formato de seções (sem corpo)', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    expect(p.descricao).toBe('')
    expect(p.historia).toBe('')
    expect(p.extras).toBe('')
    expect(p.anotacoes).toBe('')
    expect(p.imagens).toEqual([])
    expect((p as unknown as { corpo?: string }).corpo).toBeUndefined()
  })

  it('migra arquivo legado: abrir e salvar remove `corpo` do disco', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const caminho = `campanhas/${camp}/personagens/legado.json`
    // grava um personagem no formato legado (com corpo, sem os campos de seção)
    await fs.writeTextAtomic(`C:/Cofre/${caminho}`, JSON.stringify({
      id: 'x', nome: 'Legado', retrato: null, resumo: 'r',
      corpo: '<p>antigo</p>',
      criadoEm: '2020-01-01T00:00:00.000Z', modificadoEm: '2020-01-01T00:00:00.000Z',
    }))
    const p = await repo.lerPersonagem(caminho)
    expect(p.descricao).toBe('<p>antigo</p>')
    await repo.salvarPersonagem(caminho, p)
    const cru = JSON.parse(await fs.readText(`C:/Cofre/${caminho}`))
    expect(cru.corpo).toBeUndefined()
    expect(cru.descricao).toBe('<p>antigo</p>')
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

  it('salvar não muta o objeto passado', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    const antes = p.modificadoEm
    await repo.salvarPersonagem(ref.caminho, p)
    expect(p.modificadoEm).toBe(antes)
  })

  it('salvarDocumentoCanvas preserva nome renomeado concorrentemente', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarCanvasDoc(`campanhas/${camp}/sessoes`, 'Sessão 01')
    await repo.renomearItem(ref.caminho, 'Sessão 01 — Renomeada')
    await repo.salvarDocumentoCanvas(ref.caminho, { document: {}, session: {} })
    const doc = await repo.lerCanvasDoc(ref.caminho)
    expect(doc.nome).toBe('Sessão 01 — Renomeada')
    expect(doc.documento).toEqual({ document: {}, session: {} })
  })

  it('copia arquivo externo para dentro do cofre', async () => {
    await repo.inicializar()
    fs.arquivos.set('C:/Downloads/foto.png', '<bin>')
    await repo.copiarParaCofre('C:/Downloads/foto.png', 'campanhas/teste/assets/retrato.png')
    expect(await fs.exists('C:/Cofre/campanhas/teste/assets/retrato.png')).toBe(true)
  })

  it('remove arquivo do cofre por caminho relativo', async () => {
    await repo.inicializar()
    fs.arquivos.set('C:/Downloads/foto.png', '<bin>')
    await repo.copiarParaCofre('C:/Downloads/foto.png', 'campanhas/teste/assets/galeria-1.png')
    expect(await fs.exists('C:/Cofre/campanhas/teste/assets/galeria-1.png')).toBe(true)
    await repo.removerArquivoCofre('campanhas/teste/assets/galeria-1.png')
    expect(await fs.exists('C:/Cofre/campanhas/teste/assets/galeria-1.png')).toBe(false)
  })

  it('escreve binário base64 em caminho relativo', async () => {
    await repo.inicializar()
    await repo.escreverBinario('imagens-canvas/a.png', 'aGVsbG8=')
    expect(await fs.exists('C:/Cofre/imagens-canvas/a.png')).toBe(true)
  })

  it('escritas concorrentes no mesmo caminho são serializadas (última vence)', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const p = await repo.lerPersonagem(ref.caminho)
    await Promise.all([
      repo.salvarPersonagem(ref.caminho, { ...p, resumo: 'primeiro' }),
      repo.salvarPersonagem(ref.caminho, { ...p, resumo: 'segundo' }),
    ])
    const final = await repo.lerPersonagem(ref.caminho)
    expect(final.resumo).toBe('segundo')
  })

  it('escreve texto e binário em caminho absoluto (export)', async () => {
    await repo.escreverTextoAbsoluto('C:/Saida/canvas.svg', '<svg/>')
    await repo.escreverBinarioAbsoluto('C:/Saida/canvas.png', 'aGVsbG8=')
    expect(await fs.exists('C:/Saida/canvas.svg')).toBe(true)
    expect(await fs.exists('C:/Saida/canvas.png')).toBe(true)
  })

  // ---- personagens fora da campanha (pastas aninhadas) ----

  it('cria pasta com metadados e personagem dentro dela', async () => {
    const dir = await repo.criarPasta('personagens-soltos', 'Vilões')
    expect(dir).toBe('personagens-soltos/viloes')
    expect(await fs.exists('C:/Cofre/personagens-soltos/viloes/pasta.json')).toBe(true)
    const ref = await repo.criarPersonagemEm(dir, 'Strahd')
    expect(ref.caminho).toBe('personagens-soltos/viloes/strahd.json')
    expect((await repo.lerPersonagem(ref.caminho)).nome).toBe('Strahd')
  })

  it('monta a árvore de pastas aninhadas com nome vindo do pasta.json', async () => {
    const vil = await repo.criarPasta('personagens-soltos', 'Vilões')
    await repo.criarPasta(vil, 'Chefes')
    await repo.criarPersonagemEm(vil, 'Strahd')
    await repo.criarPersonagemEm('personagens-soltos', 'Andarilho')
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    expect(raiz.personagens.map((p) => p.nome)).toEqual(['Andarilho'])
    const noVil = raiz.subpastas.find((s) => s.nome === 'Vilões')!
    expect(noVil.personagens.map((p) => p.nome)).toEqual(['Strahd'])
    expect(noVil.subpastas.map((s) => s.nome)).toEqual(['Chefes'])
  })

  it('move personagem de uma campanha para uma pasta solta', async () => {
    await repo.inicializar()
    const camp = await repo.criarCampanha('Teste')
    const ref = await repo.criarPersonagem(camp, 'Baldur')
    const idAntes = (await repo.lerPersonagem(ref.caminho)).id
    const dir = await repo.criarPasta('personagens-soltos', 'Aliados')
    await repo.moverPersonagem(ref.caminho, dir)
    expect(await fs.exists(`C:/Cofre/${ref.caminho}`)).toBe(false)
    const p = await repo.lerPersonagem(`${dir}/baldur.json`)
    expect(p.nome).toBe('Baldur')
    expect(p.id).toBe(idAntes)
  })

  it('mover para o mesmo diretório é no-op', async () => {
    const ref = await repo.criarPersonagemEm('personagens-soltos', 'Solo')
    await repo.moverPersonagem(ref.caminho, 'personagens-soltos')
    expect(await fs.exists(`C:/Cofre/${ref.caminho}`)).toBe(true)
  })
})

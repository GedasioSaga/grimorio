import { beforeEach, describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { VaultRepo } from '../lib/vaultRepo'
import { ehPastaInternaDaArvore } from '../lib/pastasInternas'

describe('ehPastaInternaDaArvore', () => {
  const SEM_MARCADOR = false
  const COM_MARCADOR = true

  it('oculta a pasta de retratos em qualquer grafia (o disco não distingue maiúscula)', () => {
    expect(ehPastaInternaDaArvore('assets', SEM_MARCADOR)).toBe(true)
    expect(ehPastaInternaDaArvore('Assets', SEM_MARCADOR)).toBe(true)
    expect(ehPastaInternaDaArvore('ASSETS', SEM_MARCADOR)).toBe(true)
  })

  it('NÃO oculta "assets" quando há marcador de conteúdo: é pasta ou cenário do usuário', () => {
    expect(ehPastaInternaDaArvore('assets', COM_MARCADOR)).toBe(false)
    expect(ehPastaInternaDaArvore('Assets', COM_MARCADOR)).toBe(false)
    expect(ehPastaInternaDaArvore('ASSETS', COM_MARCADOR)).toBe(false)
  })

  it('oculta qualquer pasta que comece com ponto, com ou sem marcador', () => {
    expect(ehPastaInternaDaArvore('.git', SEM_MARCADOR)).toBe(true)
    expect(ehPastaInternaDaArvore('.obsidian', SEM_MARCADOR)).toBe(true)
    expect(ehPastaInternaDaArvore('.', SEM_MARCADOR)).toBe(true)
    expect(ehPastaInternaDaArvore('.git', COM_MARCADOR)).toBe(true)
    expect(ehPastaInternaDaArvore('.trash', COM_MARCADOR)).toBe(true)
  })

  it('não oculta pasta que só CONTÉM a palavra ou o ponto', () => {
    expect(ehPastaInternaDaArvore('assets-magicos', SEM_MARCADOR)).toBe(false)
    expect(ehPastaInternaDaArvore('meus-assets', SEM_MARCADOR)).toBe(false)
    expect(ehPastaInternaDaArvore('v1.2', SEM_MARCADOR)).toBe(false)
    expect(ehPastaInternaDaArvore('npcs', SEM_MARCADOR)).toBe(false)
    expect(ehPastaInternaDaArvore('', SEM_MARCADOR)).toBe(false)
  })
})

describe('VaultRepo esconde pastas internas na árvore lateral', () => {
  let fs: ReturnType<typeof criarFakeFs>
  let repo: VaultRepo

  /** O que o app grava na pasta de retratos: só imagem (`PerfilModal`, `transformarImagem`). */
  const RETRATO = 'retrato-p1-v1.png'

  /** Planta, sob `raiz`, o mesmo conjunto de dirs: dois a esconder, dois a manter. */
  async function plantarPastas(raiz: string): Promise<void> {
    await fs.mkdirAll(`C:/Cofre/${raiz}/assets`)
    await fs.writeTextAtomic(`C:/Cofre/${raiz}/assets/${RETRATO}`, 'bytes')
    await fs.mkdirAll(`C:/Cofre/${raiz}/.git`)
    await fs.writeTextAtomic(`C:/Cofre/${raiz}/assets-magicos/varinha.json`, JSON.stringify({ id: 'v', nome: 'Varinha' }))
    await fs.writeTextAtomic(`C:/Cofre/${raiz}/vilas/pasta.json`, JSON.stringify({ nome: 'Vilas' }))
  }

  /** Slugs ordenados: o fake lista na ordem de inserção, e a ordem não é o que se prova aqui. */
  const slugsDe = (nos: { slug: string }[]): string[] => nos.map((n) => n.slug).sort()

  /** Acha a subpasta pelo slug ou falha alto — `find` devolvendo undefined viraria falso-verde. */
  function subpasta<T extends { slug: string; subpastas: T[] }>(no: T, slug: string): T {
    const achada = no.subpastas.find((s) => s.slug === slug)
    if (!achada) throw new Error(`subpasta "${slug}" não encontrada em "${no.slug}"`)
    return achada
  }

  beforeEach(async () => {
    fs = criarFakeFs()
    repo = new VaultRepo('C:/Cofre', fs)
    await repo.inicializar()
  })

  it('personagens: assets e .git somem, assets-magicos e vilas ficam', async () => {
    await plantarPastas('personagens-soltos')
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    expect(slugsDe(raiz.subpastas)).toEqual(['assets-magicos', 'vilas'])
    expect(raiz.personagens).toEqual([])
  })

  it('personagens: `Assets` maiúsculo some do mesmo jeito', async () => {
    await fs.mkdirAll('C:/Cofre/personagens-soltos/Assets')
    await fs.mkdirAll('C:/Cofre/personagens-soltos/npcs')
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    expect(slugsDe(raiz.subpastas)).toEqual(['npcs'])
  })

  it('itens: mesma regra que personagens', async () => {
    await plantarPastas('itens')
    const raiz = await repo.montarArvoreItens()
    expect(slugsDe(raiz.subpastas)).toEqual(['assets-magicos', 'vilas'])
    expect(raiz.itens).toEqual([])
  })

  it('cenários: assets e .trash somem; pasta, cenário e .notas seguem como antes', async () => {
    await fs.mkdirAll('C:/Cofre/cenarios/assets')
    await fs.mkdirAll('C:/Cofre/cenarios/.trash')
    await fs.mkdirAll('C:/Cofre/cenarios/mapa.notas')
    await fs.writeTextAtomic('C:/Cofre/cenarios/regiao/pasta.json', JSON.stringify({ nome: 'Região' }))
    await fs.writeTextAtomic('C:/Cofre/cenarios/taverna/cenario.json', JSON.stringify({ id: 't', nome: 'Taverna' }))
    const raiz = await repo.montarArvoreCenarios()
    expect(slugsDe(raiz.subpastas)).toEqual(['regiao'])
    expect(slugsDe(raiz.cenarios)).toEqual(['taverna'])
  })

  /**
   * O filtro vive DENTRO das funções recursivas. Se alguém o mover para fora do laço, ou
   * trocar a recursão por varredura plana, os casos de raiz seguem verdes e a pasta volta a
   * aparecer a partir do segundo nível — por isso planta-se a infraestrutura em nível 2 e 3.
   */
  describe('em profundidade: o filtro acompanha a recursão', () => {
    /** Planta assets e uma pasta com ponto dentro de uma subpasta legítima, e mais fundo ainda. */
    async function plantarEmProfundidade(raiz: string): Promise<void> {
      await fs.writeTextAtomic(`C:/Cofre/${raiz}/vilas/pasta.json`, JSON.stringify({ nome: 'Vilas' }))
      await fs.mkdirAll(`C:/Cofre/${raiz}/vilas/assets`)
      await fs.writeTextAtomic(`C:/Cofre/${raiz}/vilas/assets/${RETRATO}`, 'bytes')
      await fs.mkdirAll(`C:/Cofre/${raiz}/vilas/.trash`)
      await fs.writeTextAtomic(`C:/Cofre/${raiz}/vilas/aldeia/pasta.json`, JSON.stringify({ nome: 'Aldeia' }))
      await fs.mkdirAll(`C:/Cofre/${raiz}/vilas/aldeia/Assets`)
      await fs.mkdirAll(`C:/Cofre/${raiz}/vilas/aldeia/.obsidian`)
      await fs.writeTextAtomic(`C:/Cofre/${raiz}/vilas/aldeia/assets-magicos/pasta.json`, JSON.stringify({ nome: 'Assets Mágicos' }))
    }

    it('personagens: assets e .trash somem no nível 2, Assets e .obsidian no nível 3', async () => {
      await plantarEmProfundidade('personagens-soltos')
      const raiz = await repo.montarArvorePastas('personagens-soltos')
      const vilas = subpasta(raiz, 'vilas')
      expect(slugsDe(vilas.subpastas)).toEqual(['aldeia'])
      const aldeia = subpasta(vilas, 'aldeia')
      expect(slugsDe(aldeia.subpastas)).toEqual(['assets-magicos'])
      expect(await fs.exists(`C:/Cofre/personagens-soltos/vilas/assets/${RETRATO}`)).toBe(true)
    })

    it('itens: mesma regra em profundidade', async () => {
      await plantarEmProfundidade('itens')
      const raiz = await repo.montarArvoreItens()
      const vilas = subpasta(raiz, 'vilas')
      expect(slugsDe(vilas.subpastas)).toEqual(['aldeia'])
      expect(slugsDe(subpasta(vilas, 'aldeia').subpastas)).toEqual(['assets-magicos'])
    })

    it('cenários: assets e .trash somem dentro de pasta organizacional, e mais fundo também', async () => {
      await fs.writeTextAtomic('C:/Cofre/cenarios/regiao/pasta.json', JSON.stringify({ nome: 'Região' }))
      await fs.mkdirAll('C:/Cofre/cenarios/regiao/assets')
      await fs.mkdirAll('C:/Cofre/cenarios/regiao/.trash')
      await fs.writeTextAtomic('C:/Cofre/cenarios/regiao/taverna/cenario.json', JSON.stringify({ id: 't', nome: 'Taverna' }))
      await fs.writeTextAtomic('C:/Cofre/cenarios/regiao/norte/pasta.json', JSON.stringify({ nome: 'Norte' }))
      await fs.mkdirAll('C:/Cofre/cenarios/regiao/norte/Assets')
      await fs.mkdirAll('C:/Cofre/cenarios/regiao/norte/.obsidian')
      await fs.writeTextAtomic('C:/Cofre/cenarios/regiao/norte/assets-magicos/pasta.json', JSON.stringify({ nome: 'Assets Mágicos' }))
      const raiz = await repo.montarArvoreCenarios()
      const regiao = subpasta(raiz, 'regiao')
      expect(slugsDe(regiao.subpastas)).toEqual(['norte'])
      expect(slugsDe(regiao.cenarios)).toEqual(['taverna'])
      expect(slugsDe(subpasta(regiao, 'norte').subpastas)).toEqual(['assets-magicos'])
      expect(await fs.exists('C:/Cofre/cenarios/regiao/assets')).toBe(true)
    })
  })

  /**
   * Regressão: slugify('Assets') === 'assets', então um cenário ou pasta que o USUÁRIO
   * batiza de "Assets" cai num dir com o mesmo nome do de retratos. O filtro rodava antes
   * do discriminador e engolia o conteúdo do mestre sem erro na tela. O que separa os dois
   * é o marcador que o app grava dentro: cenario.json (cenário) ou pasta.json (pasta).
   */
  describe('pasta do usuário chamada "Assets" não some: o marcador de conteúdo a distingue do retrato', () => {
    const ficha = (nome: string) => JSON.stringify({ id: nome.toLowerCase(), nome })

    it('personagens: dir assets COM pasta.json aparece como pasta, e as fichas de dentro aparecem', async () => {
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/assets/pasta.json', JSON.stringify({ nome: 'Assets' }))
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/assets/goblin.json', ficha('Goblin'))
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/assets/orc.json', ficha('Orc'))
      const raiz = await repo.montarArvorePastas('personagens-soltos')
      const assets = subpasta(raiz, 'assets')
      expect(assets.nome).toBe('Assets')
      expect(slugsDe(assets.personagens)).toEqual(['goblin', 'orc'])
    })

    it('personagens: dir assets SEM marcador continua oculto ao lado de um COM marcador', async () => {
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/vilas/pasta.json', JSON.stringify({ nome: 'Vilas' }))
      await fs.mkdirAll('C:/Cofre/personagens-soltos/vilas/assets')
      await fs.writeTextAtomic(`C:/Cofre/personagens-soltos/vilas/assets/${RETRATO}`, 'bytes')
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/aldeia/pasta.json', JSON.stringify({ nome: 'Aldeia' }))
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/aldeia/assets/pasta.json', JSON.stringify({ nome: 'Assets' }))
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/aldeia/assets/goblin.json', ficha('Goblin'))
      const raiz = await repo.montarArvorePastas('personagens-soltos')
      expect(slugsDe(subpasta(raiz, 'vilas').subpastas)).toEqual([])
      const assets = subpasta(subpasta(raiz, 'aldeia'), 'assets')
      expect(slugsDe(assets.personagens)).toEqual(['goblin'])
      expect(await fs.exists(`C:/Cofre/personagens-soltos/vilas/assets/${RETRATO}`)).toBe(true)
    })

    it('personagens: pasta com ponto some MESMO com pasta.json dentro', async () => {
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/.trash/pasta.json', JSON.stringify({ nome: 'Lixeira' }))
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/.trash/goblin.json', ficha('Goblin'))
      const raiz = await repo.montarArvorePastas('personagens-soltos')
      expect(slugsDe(raiz.subpastas)).toEqual([])
    })

    it('itens: dir Assets COM pasta.json aparece com os itens de dentro, em profundidade 3', async () => {
      await fs.writeTextAtomic('C:/Cofre/itens/armas/pasta.json', JSON.stringify({ nome: 'Armas' }))
      await fs.writeTextAtomic('C:/Cofre/itens/armas/lendarias/pasta.json', JSON.stringify({ nome: 'Lendárias' }))
      await fs.writeTextAtomic('C:/Cofre/itens/armas/lendarias/Assets/pasta.json', JSON.stringify({ nome: 'Assets' }))
      await fs.writeTextAtomic('C:/Cofre/itens/armas/lendarias/Assets/espada.json', ficha('Espada'))
      await fs.mkdirAll('C:/Cofre/itens/armas/lendarias/.obsidian')
      await fs.writeTextAtomic('C:/Cofre/itens/armas/lendarias/.obsidian/pasta.json', JSON.stringify({ nome: 'x' }))
      const raiz = await repo.montarArvoreItens()
      const lendarias = subpasta(subpasta(raiz, 'armas'), 'lendarias')
      expect(slugsDe(lendarias.subpastas)).toEqual(['Assets'])
      expect(slugsDe(subpasta(lendarias, 'Assets').itens)).toEqual(['espada'])
    })

    it('itens: dir assets só com imagem continua oculto', async () => {
      await fs.mkdirAll('C:/Cofre/itens/assets')
      await fs.writeTextAtomic(`C:/Cofre/itens/assets/${RETRATO}`, 'bytes')
      const raiz = await repo.montarArvoreItens()
      expect(slugsDe(raiz.subpastas)).toEqual([])
      expect(raiz.itens).toEqual([])
    })

    /**
     * Pasta criada à mão no disco não tem pasta.json (`garantirIdDePasta` só o grava no
     * primeiro 🏷️). Sem olhar o que tem dentro, a pasta e as fichas sumiam sem erro.
     */
    it('personagens: dir Assets criado à mão, sem pasta.json, com fichas dentro, aparece', async () => {
      await fs.writeTextAtomic('C:/Cofre/personagens-soltos/Assets/goblin.json', ficha('Goblin'))
      await fs.writeTextAtomic(`C:/Cofre/personagens-soltos/Assets/${RETRATO}`, 'bytes')
      const raiz = await repo.montarArvorePastas('personagens-soltos')
      expect(slugsDe(subpasta(raiz, 'Assets').personagens)).toEqual(['goblin'])
    })

    it('itens: dir assets criado à mão com só uma subpasta de itens dentro, aparece', async () => {
      await fs.writeTextAtomic('C:/Cofre/itens/assets/armas/espada.json', ficha('Espada'))
      const raiz = await repo.montarArvoreItens()
      const armas = subpasta(subpasta(raiz, 'assets'), 'armas')
      expect(slugsDe(armas.itens)).toEqual(['espada'])
    })

    it('itens: ficha ilegível dentro de assets criado à mão ainda conta como conteúdo', async () => {
      await fs.writeTextAtomic('C:/Cofre/itens/assets/quebrado.json', '{ não é json')
      const raiz = await repo.montarArvoreItens()
      expect(slugsDe(subpasta(raiz, 'assets').itens)).toEqual(['quebrado'])
    })

    it('cenários: dir assets criado à mão, sem marcador, com cenário dentro, aparece', async () => {
      await fs.writeTextAtomic('C:/Cofre/cenarios/assets/taverna/cenario.json', JSON.stringify({ id: 't', nome: 'Taverna' }))
      await fs.mkdirAll('C:/Cofre/cenarios/regiao/assets')
      const raiz = await repo.montarArvoreCenarios()
      expect(slugsDe(subpasta(raiz, 'assets').cenarios)).toEqual(['taverna'])
      expect(slugsDe(subpasta(raiz, 'regiao').subpastas)).toEqual([])
    })

    it('cenários: dir assets COM cenario.json aparece como cenário, com o nome gravado', async () => {
      await fs.writeTextAtomic('C:/Cofre/cenarios/assets/cenario.json', JSON.stringify({ id: 'c1', nome: 'Assets' }))
      const raiz = await repo.montarArvoreCenarios()
      expect(slugsDe(raiz.cenarios)).toEqual(['assets'])
      expect(raiz.cenarios[0]?.nome).toBe('Assets')
      expect(raiz.cenarios[0]?.id).toBe('c1')
      expect(slugsDe(raiz.subpastas)).toEqual([])
    })

    it('cenários: dir assets COM pasta.json (pasta organizacional) aparece, e os cenários de dentro aparecem', async () => {
      await fs.writeTextAtomic('C:/Cofre/cenarios/assets/pasta.json', JSON.stringify({ nome: 'Assets' }))
      await fs.writeTextAtomic('C:/Cofre/cenarios/assets/taverna/cenario.json', JSON.stringify({ id: 't', nome: 'Taverna' }))
      const raiz = await repo.montarArvoreCenarios()
      const assets = subpasta(raiz, 'assets')
      expect(assets.nome).toBe('Assets')
      expect(slugsDe(assets.cenarios)).toEqual(['taverna'])
    })

    it('cenários: em profundidade 2, assets SEM marcador some e assets COM cenario.json fica', async () => {
      await fs.writeTextAtomic('C:/Cofre/cenarios/regiao/pasta.json', JSON.stringify({ nome: 'Região' }))
      await fs.mkdirAll('C:/Cofre/cenarios/regiao/assets')
      await fs.writeTextAtomic('C:/Cofre/cenarios/norte/pasta.json', JSON.stringify({ nome: 'Norte' }))
      await fs.writeTextAtomic('C:/Cofre/cenarios/norte/assets/cenario.json', JSON.stringify({ id: 'a', nome: 'Assets' }))
      await fs.writeTextAtomic('C:/Cofre/cenarios/norte/.trash/cenario.json', JSON.stringify({ id: 'l', nome: 'Lixo' }))
      const raiz = await repo.montarArvoreCenarios()
      expect(slugsDe(subpasta(raiz, 'regiao').subpastas)).toEqual([])
      expect(slugsDe(subpasta(raiz, 'regiao').cenarios)).toEqual([])
      const norte = subpasta(raiz, 'norte')
      expect(slugsDe(norte.cenarios)).toEqual(['assets'])
      expect(slugsDe(norte.subpastas)).toEqual([])
      expect(await fs.exists('C:/Cofre/cenarios/regiao/assets')).toBe(true)
    })
  })

  it('a pasta assets continua no disco: só sai da árvore', async () => {
    await plantarPastas('personagens-soltos')
    const raiz = await repo.montarArvorePastas('personagens-soltos')
    expect(slugsDe(raiz.subpastas)).not.toContain('assets')
    expect(await fs.exists('C:/Cofre/personagens-soltos/assets')).toBe(true)
    expect(await fs.exists(`C:/Cofre/personagens-soltos/assets/${RETRATO}`)).toBe(true)
  })
})

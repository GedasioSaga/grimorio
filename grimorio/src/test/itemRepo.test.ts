import { beforeEach, describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { VaultRepo, normalizarItem } from '../lib/vaultRepo'
import { buscarItens } from '../lib/buscaArvore'
import { contarItens, filtrarPastaItens } from '../lib/filtroCampanha'
import { textoDaEntidade } from '../lib/contextoEntidade'
import { normalizarVinculos } from '../lib/vinculos'
import type { Item } from '../lib/types'

let fs: ReturnType<typeof criarFakeFs>
let repo: VaultRepo

beforeEach(() => {
  fs = criarFakeFs()
  repo = new VaultRepo('C:/Cofre', fs)
})

describe('normalizarItem', () => {
  it('preenche os campos ausentes sem inventar conteúdo', () => {
    const i = normalizarItem({ id: 'i1', nome: 'Espada' })
    expect(i).toMatchObject({
      id: 'i1', nome: 'Espada', resumo: '', retrato: null,
      descricao: '', informacao: '', efeito: '',
    })
    // undefined some do JSON: arquivo sem enquadramento não ganha campo vazio
    expect('foco' in i && i.foco !== undefined).toBe(false)
  })

  it('PRESERVA o id existente — gerar outro quebraria todos os vínculos que apontam pra ele', () => {
    expect(normalizarItem({ id: 'i-fixo', nome: 'x' }).id).toBe('i-fixo')
  })

  it('arquivo sem id ganha um (não deixa a entidade inalcançável)', () => {
    expect(normalizarItem({ nome: 'sem id' }).id).toBeTruthy()
  })

  it('lixo total vira item vazio em vez de explodir', () => {
    const i = normalizarItem({} as Record<string, unknown>)
    expect(i.nome).toBe('')
    expect(i.efeito).toBe('')
  })
})

describe('VaultRepo — itens', () => {
  it('cria o item com os três campos vazios e devolve a ref', async () => {
    const ref = await repo.criarItemEm('itens', 'Espada Rúnica')
    expect(ref.caminho).toBe('itens/espada-runica.json')
    const lido = await repo.lerItem(ref.caminho)
    expect(lido.id).toBe(ref.id)
    expect(lido.nome).toBe('Espada Rúnica')
    expect([lido.descricao, lido.informacao, lido.efeito]).toEqual(['', '', ''])
  })

  it('dois itens de mesmo nome não colidem de arquivo', async () => {
    const a = await repo.criarItemEm('itens', 'Poção')
    const b = await repo.criarItemEm('itens', 'Poção')
    expect(a.caminho).not.toBe(b.caminho)
  })

  it('salvar preserva o id e atualiza modificadoEm', async () => {
    const ref = await repo.criarItemEm('itens', 'Anel')
    const antes = await repo.lerItem(ref.caminho)
    await repo.salvarItem(ref.caminho, { ...antes, efeito: '<p>invisibilidade</p>' })
    const depois = await repo.lerItem(ref.caminho)
    expect(depois.id).toBe(antes.id)
    expect(depois.efeito).toBe('<p>invisibilidade</p>')
    expect(depois.modificadoEm >= antes.modificadoEm).toBe(true)
  })

  it('monta a árvore com pastas aninhadas', async () => {
    await repo.criarPasta('itens', 'Armas')
    await repo.criarItemEm('itens/armas', 'Machado')
    await repo.criarItemEm('itens', 'Corda')

    const raiz = await repo.montarArvoreItens()
    expect(raiz.itens.map((i) => i.nome)).toEqual(['Corda'])
    expect(raiz.subpastas.map((p) => p.nome)).toEqual(['Armas'])
    expect(raiz.subpastas[0].itens.map((i) => i.nome)).toEqual(['Machado'])
  })

  it('pasta.json não vira item na listagem', async () => {
    await repo.criarPasta('itens', 'Armas')
    const raiz = await repo.montarArvoreItens()
    expect(raiz.subpastas[0].itens).toEqual([])
  })

  it('arquivo corrompido é marcado, não derruba a árvore', async () => {
    await repo.criarItemEm('itens', 'Bom')
    await fs.writeTextAtomic('C:/Cofre/itens/quebrado.json', '{ não é json')
    const raiz = await repo.montarArvoreItens()
    expect(raiz.itens.find((i) => i.slug === 'quebrado')?.erro).toBe(true)
    expect(raiz.itens.find((i) => i.slug === 'bom')?.erro).toBeUndefined()
  })

  it('cofre sem pasta itens devolve raiz vazia em vez de lançar', async () => {
    const raiz = await repo.montarArvoreItens()
    expect(raiz.itens).toEqual([])
    expect(raiz.subpastas).toEqual([])
  })

  it('mover leva o item para outra pasta', async () => {
    await repo.criarPasta('itens', 'Armas')
    const ref = await repo.criarItemEm('itens', 'Adaga')
    await repo.moverItem(ref.caminho, 'itens/armas')

    const raiz = await repo.montarArvoreItens()
    expect(raiz.itens).toEqual([])
    expect(raiz.subpastas[0].itens.map((i) => i.nome)).toEqual(['Adaga'])
  })

  it('a árvore do cofre inclui a seção de itens', async () => {
    await repo.criarItemEm('itens', 'Tocha')
    const tree = await repo.montarArvore()
    expect(tree.itens.itens.map((i) => i.nome)).toEqual(['Tocha'])
  })
})

/** Raiz de itens montada à mão, para os testes puros. */
function raiz(itens: string[] = [], subpastas: ReturnType<typeof pasta>[] = []) {
  return {
    slug: 'itens', nome: 'itens', caminho: 'itens', subpastas,
    itens: itens.map((n) => ({ slug: n.toLowerCase(), nome: n, caminho: `itens/${n.toLowerCase()}.json` })),
  }
}
function pasta(caminho: string, id: string | undefined, itens: string[] = []) {
  return {
    slug: caminho.split('/').pop()!, nome: caminho.split('/').pop()!, caminho, id, subpastas: [],
    itens: itens.map((n) => ({ slug: n.toLowerCase(), nome: n, caminho: `${caminho}/${n.toLowerCase()}.json` })),
  }
}

describe('buscarItens', () => {
  it('acha em pasta aninhada e mostra o caminho', () => {
    const r = raiz(['Corda'], [pasta('itens/armas', 'p1', ['Machado', 'Adaga'])])
    const achados = buscarItens(r, 'mach')
    expect(achados.map((a) => a.item.nome)).toEqual(['Machado'])
    expect(achados[0].caminhoRotulo).toBe('armas')
  })

  it('termo vazio não devolve nada (a seção volta ao modo árvore)', () => {
    expect(buscarItens(raiz(['Corda']), '  ')).toEqual([])
  })

  it('ignora acento e caixa', () => {
    expect(buscarItens(raiz(['Poção de Cura']), 'pocao').map((a) => a.item.nome)).toEqual(['Poção de Cura'])
  })
})

describe('filtrarPastaItens', () => {
  it('mantém só os itens da campanha', () => {
    const r = raiz(['Corda', 'Tocha'])
    const filtrada = filtrarPastaItens(r, new Set(['itens/corda.json']))
    expect(filtrada.itens.map((i) => i.nome)).toEqual(['Corda'])
  })

  it('pasta etiquetada libera a subárvore inteira', () => {
    const r = raiz([], [pasta('itens/armas', 'p1', ['Machado', 'Adaga'])])
    const filtrada = filtrarPastaItens(r, new Set(), new Set(['p1']))
    expect(filtrada.subpastas[0].itens.map((i) => i.nome)).toEqual(['Machado', 'Adaga'])
  })

  it('pasta etiquetada e vazia não é podada', () => {
    const r = raiz([], [pasta('itens/armas', 'p1', [])])
    expect(filtrarPastaItens(r, new Set(), new Set(['p1'])).subpastas).toHaveLength(1)
  })

  it('a RAIZ nunca é "permitida" — senão o filtro sumiria por inteiro', () => {
    const r = { ...raiz(['Corda', 'Tocha']), id: 'p-raiz' }
    const filtrada = filtrarPastaItens(r, new Set(['itens/corda.json']), new Set(['p-raiz']))
    expect(filtrada.itens.map((i) => i.nome)).toEqual(['Corda'])
  })

  it('contarItens soma a árvore toda', () => {
    expect(contarItens(raiz(['Corda'], [pasta('itens/armas', 'p1', ['Machado', 'Adaga'])]))).toBe(3)
  })
})

describe('textoDaEntidade — item', () => {
  const base: Item = {
    id: 'i1', nome: 'Espada Rúnica', resumo: 'lâmina que canta', retrato: null,
    descricao: '<p>Aço claro.</p>', informacao: '<p>Peso 2kg.</p>', efeito: '<p>+2 de dano.</p>',
    criadoEm: '', modificadoEm: '',
  }

  it('inclui nome, resumo e as três seções', () => {
    const txt = textoDaEntidade(base, 'item')
    expect(txt).toContain('# Item: Espada Rúnica')
    expect(txt).toContain('Resumo: lâmina que canta')
    expect(txt).toContain('## Descrição\nAço claro.')
    expect(txt).toContain('## Informações\nPeso 2kg.')
    expect(txt).toContain('## Efeito\n+2 de dano.')
  })

  it('seção vazia não vira cabeçalho solto no prompt', () => {
    const txt = textoDaEntidade({ ...base, efeito: '<p></p>' }, 'item')
    expect(txt).not.toContain('## Efeito')
  })
})

describe('normalizarVinculos — item como ponta', () => {
  const bruto = (over: Record<string, unknown>) => ({
    vinculos: [{ id: 'v1', deId: 'a', paraId: 'b', tipo: 'carrega', notas: '', criadoEm: '', ...over }],
  })

  it('aceita item nas duas pontas', () => {
    expect(normalizarVinculos(bruto({ deTipo: 'item', paraTipo: 'personagem' }))).toHaveLength(1)
    expect(normalizarVinculos(bruto({ deTipo: 'personagem', paraTipo: 'item' }))).toHaveLength(1)
    expect(normalizarVinculos(bruto({ deTipo: 'item', paraTipo: 'cenario' }))).toHaveLength(1)
  })

  it('canvas continua barrado como ALVO de relação', () => {
    expect(normalizarVinculos(bruto({ deTipo: 'item', paraTipo: 'canvas' }))).toEqual([])
  })
})

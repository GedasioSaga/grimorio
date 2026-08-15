import { describe, it, expect } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { carregarPaginasDoCofre, docsComCaderno, pontuarPaginasCarregadas } from '../lib/buscaPaginas'
import { NotebookRepo } from '../lib/notebookRepo'
import type { VaultTree } from '../lib/types'

const VAULT = 'C:/Cofre'

function tree(parcial: Partial<VaultTree> = {}): VaultTree {
  return {
    campanhas: [],
    canvasesSoltos: [],
    mapasSoltos: [],
    personagensSoltos: { slug: 'raiz', nome: 'raiz', caminho: 'x', personagens: [], subpastas: [] },
    cenarios: { slug: 'cenarios', nome: 'Cenários', caminho: 'cenarios', cenarios: [], subpastas: [] },
    itens: { slug: 'itens', nome: 'Itens', caminho: 'itens', itens: [], subpastas: [] },
    ...parcial,
  }
}

describe('docsComCaderno', () => {
  it('lista soltos e de campanha, cada um com o tipoAbertura certo', () => {
    const t = tree({
      canvasesSoltos: [{ slug: 'c', nome: 'Canvas Solto', caminho: 'canvases-soltos/c.json' }],
      mapasSoltos: [{ slug: 'm', nome: 'Mapa Solto', caminho: 'mapas-soltos/m.json' }],
      campanhas: [{
        id: 'c1', slug: 'c1', nome: 'Campanha 1', personagens: [],
        sessoes: [{ slug: 's', nome: 'Sessão 1', caminho: 'campanhas/c1/sessoes/s.json' }],
        canvases: [{ slug: 'cv', nome: 'Canvas 1', caminho: 'campanhas/c1/canvases/cv.json' }],
        escritas: [{ slug: 'e', nome: 'Escrita 1', caminho: 'campanhas/c1/escrita/e.json' }],
      }],
    })
    const docs = docsComCaderno(t)
    // 2 soltos (canvas + mapa) + 3 de campanha (sessão + canvas + escrita)
    expect(docs).toHaveLength(5)
    expect(docs.find((d) => d.docNome === 'Canvas Solto')).toMatchObject({ tipoAbertura: 'canvas', campanhaNome: '' })
    expect(docs.find((d) => d.docNome === 'Mapa Solto')).toMatchObject({ tipoAbertura: 'mapa', campanhaNome: '' })
    expect(docs.find((d) => d.docNome === 'Sessão 1')).toMatchObject({ tipoAbertura: 'sessao', campanhaNome: 'Campanha 1' })
    expect(docs.find((d) => d.docNome === 'Canvas 1')).toMatchObject({ tipoAbertura: 'canvas', campanhaNome: 'Campanha 1' })
    expect(docs.find((d) => d.docNome === 'Escrita 1')).toMatchObject({ tipoAbertura: 'escrita', campanhaNome: 'Campanha 1' })
  })
})

describe('carregarPaginasDoCofre + pontuarPaginasCarregadas', () => {
  it('caderno sem pasta (nunca escreveu página) não derruba a carga — some da lista', async () => {
    const fs = criarFakeFs()
    const t = tree({ canvasesSoltos: [{ slug: 'c', nome: 'Canvas Vazio', caminho: 'canvases-soltos/c.json' }] })
    expect(await carregarPaginasDoCofre(VAULT, t, fs)).toEqual([])
  })

  it('página com erro (json corrompido) é descartada na carga', async () => {
    const fs = criarFakeFs()
    await fs.mkdirAll(`${VAULT}/canvases-soltos/c.notas`)
    await fs.writeTextAtomic(`${VAULT}/canvases-soltos/c.notas/pagina-ruim.json`, '{ nao é json')
    const t = tree({ canvasesSoltos: [{ slug: 'c', nome: 'Canvas', caminho: 'canvases-soltos/c.json' }] })
    expect(await carregarPaginasDoCofre(VAULT, t, fs)).toEqual([])
  })

  it('acha página pelo título, ignorando acento e caixa, com rótulo campanha/doc', async () => {
    const fs = criarFakeFs()
    const repo = new NotebookRepo(`${VAULT}/campanhas/c1/sessoes/s.notas`, fs)
    await repo.criarPagina('O Gancho da Sessão', null)

    const t = tree({
      campanhas: [{
        id: 'c1', slug: 'c1', nome: 'Campanha 1', personagens: [], canvases: [], escritas: [],
        sessoes: [{ slug: 's', nome: 'Sessão 1', caminho: 'campanhas/c1/sessoes/s.json' }],
      }],
    })
    const paginas = await carregarPaginasDoCofre(VAULT, t, fs)
    const r = pontuarPaginasCarregadas(paginas, 'gancho')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ tipo: 'pagina', nome: 'O Gancho da Sessão', caminhoRotulo: 'Campanha 1/Sessão 1', tipoAbertura: 'sessao' })
  })

  it('doc solto usa só o nome do doc como rótulo (sem campanha)', async () => {
    const fs = criarFakeFs()
    const repo = new NotebookRepo(`${VAULT}/canvases-soltos/c.notas`, fs)
    await repo.criarPagina('Nota Solta', null)

    const t = tree({ canvasesSoltos: [{ slug: 'c', nome: 'Canvas Solto', caminho: 'canvases-soltos/c.json' }] })
    const paginas = await carregarPaginasDoCofre(VAULT, t, fs)
    expect(pontuarPaginasCarregadas(paginas, 'nota')[0].caminhoRotulo).toBe('Canvas Solto')
  })

  it('termo vazio devolve lista vazia', () => {
    expect(pontuarPaginasCarregadas([], '')).toEqual([])
    expect(pontuarPaginasCarregadas([{ doc: { tipoAbertura: 'canvas', docCaminho: 'x.json', docNome: 'X', campanhaNome: '' }, titulo: 'Y', slug: 'y' }], '   ')).toEqual([])
  })
})

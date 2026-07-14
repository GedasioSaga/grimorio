import { beforeEach, describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { NotebookRepo } from '../lib/notebookRepo'

let fs: ReturnType<typeof criarFakeFs>
let repo: NotebookRepo

beforeEach(() => {
  fs = criarFakeFs()
  repo = new NotebookRepo('C:/Cofre/campanhas/x/escrita', fs)
})

describe('NotebookRepo', () => {
  it('cria página raiz com ordem 0', async () => {
    const ref = await repo.criarPagina('O Gancho', null)
    expect(ref.slug).toBe('o-gancho')
    const p = await repo.lerPagina(ref.slug)
    expect(p.titulo).toBe('O Gancho')
    expect(p.paiId).toBeNull()
    expect(p.ordem).toBe(0)
    expect(p.id).toBeTruthy()
  })

  it('irmãos ganham ordem incremental', async () => {
    await repo.criarPagina('A', null)
    const b = await repo.criarPagina('B', null)
    expect((await repo.lerPagina(b.slug)).ordem).toBe(1)
  })

  it('subpágina referencia o pai', async () => {
    const pai = await repo.criarPagina('Pai', null)
    const filho = await repo.criarPagina('Filho', pai.id)
    expect((await repo.lerPagina(filho.slug)).paiId).toBe(pai.id)
  })

  it('salvarCorpo preserva id e título', async () => {
    const ref = await repo.criarPagina('Nota', null)
    const idAntes = (await repo.lerPagina(ref.slug)).id
    await repo.salvarCorpo(ref.slug, '<p>texto</p>')
    const p = await repo.lerPagina(ref.slug)
    expect(p.corpo).toBe('<p>texto</p>')
    expect(p.titulo).toBe('Nota')
    expect(p.id).toBe(idAntes)
  })

  it('renomeia página (muda título, mantém arquivo)', async () => {
    const ref = await repo.criarPagina('Velho', null)
    await repo.renomearPagina(ref.slug, 'Novo')
    expect((await repo.lerPagina(ref.slug)).titulo).toBe('Novo')
  })

  it('monta árvore aninhada e ordenada', async () => {
    const pai = await repo.criarPagina('Pai', null)
    await repo.criarPagina('Filho 1', pai.id)
    await repo.criarPagina('Filho 2', pai.id)
    await repo.criarPagina('Solto', null)
    const arv = await repo.montarArvore()
    expect(arv).toHaveLength(2) // Pai, Solto
    const noPai = arv.find((n) => n.titulo === 'Pai')!
    expect(noPai.filhos.map((f) => f.titulo)).toEqual(['Filho 1', 'Filho 2'])
  })

  it('excluir remove a página e as descendentes', async () => {
    const pai = await repo.criarPagina('Pai', null)
    const filho = await repo.criarPagina('Filho', pai.id)
    await repo.excluirPagina(pai.slug)
    expect(await fs.exists(`C:/Cofre/campanhas/x/escrita/${pai.slug}.json`)).toBe(false)
    expect(await fs.exists(`C:/Cofre/campanhas/x/escrita/${filho.slug}.json`)).toBe(false)
  })

  it('mover reparenta e renumera irmãos', async () => {
    const a = await repo.criarPagina('A', null)
    const b = await repo.criarPagina('B', null)
    const c = await repo.criarPagina('C', null)
    await repo.moverPagina(c.id, null, 0)
    const arv = await repo.montarArvore()
    expect(arv.map((n) => n.titulo)).toEqual(['C', 'A', 'B'])
    expect(arv[0].id).toBe((await repo.lerPagina(c.slug)).id)
    expect(a.id && b.id).toBeTruthy()
  })

  it('mover para dentro da própria descendência é ignorado (sem ciclo)', async () => {
    const pai = await repo.criarPagina('Pai', null)
    const filho = await repo.criarPagina('Filho', pai.id)
    await repo.moverPagina(pai.id, filho.id, 0)
    const arv = await repo.montarArvore()
    expect(arv.find((n) => n.id === pai.id)).toBeTruthy()
  })

  it('página corrompida vira nó com erro, sem derrubar a árvore', async () => {
    await repo.criarPagina('Boa', null)
    await fs.writeTextAtomic('C:/Cofre/campanhas/x/escrita/quebrada.json', '{nao é json')
    const arv = await repo.montarArvore()
    const quebrada = arv.find((n) => n.slug === 'quebrada')
    expect(quebrada?.erro).toBe(true)
    expect(arv.find((n) => n.titulo === 'Boa')).toBeTruthy()
  })
})

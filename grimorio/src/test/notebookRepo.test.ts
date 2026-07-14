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

  it('mover para dentro de outro pai reparenta e ordena os filhos do destino', async () => {
    const p = await repo.criarPagina('P', null)
    const x = await repo.criarPagina('X', p.id)
    await repo.criarPagina('Y', p.id)
    const s = await repo.criarPagina('Solta', null)
    await repo.moverPagina(s.id, p.id, 1) // entra entre X e Y
    expect((await repo.lerPagina(s.slug)).paiId).toBe(p.id)
    const arv = await repo.montarArvore()
    const noP = arv.find((n) => n.id === p.id)!
    expect(noP.filhos.map((f) => f.titulo)).toEqual(['X', 'Solta', 'Y'])
    expect(noP.filhos.map((f) => f.ordem)).toEqual([0, 1, 2])
    expect(x.id).toBeTruthy()
  })

  it('excluir remove só a subárvore, irmão sobrevive; slug inexistente não quebra', async () => {
    const alvo = await repo.criarPagina('Alvo', null)
    const irmao = await repo.criarPagina('Irmão', null)
    await repo.excluirPagina(alvo.slug)
    expect(await fs.exists(`C:/Cofre/campanhas/x/escrita/${irmao.slug}.json`)).toBe(true)
    await repo.excluirPagina('nao-existe') // não lança
    expect((await repo.montarArvore()).map((n) => n.titulo)).toEqual(['Irmão'])
  })

  it('salvarCorpo e moverPagina concorrentes na mesma página não se sobrescrevem (com latência)', async () => {
    await repo.criarPagina('B', null) // ocupa a ordem 0
    const a = await repo.criarPagina('A', null) // ordem 1
    fs.atrasoEscritaMs = 20 // escrita atrasada: sem serialização, o move relê 'a' velho e sobrescreve o corpo
    await Promise.all([
      repo.salvarCorpo(a.slug, '<p>corpo novo</p>'),
      repo.moverPagina(a.id, null, 0), // 'a' vai p/ frente: é o 1o arquivo reescrito no loop, lido cedo
    ])
    fs.atrasoEscritaMs = 0
    const p = await repo.lerPagina(a.slug)
    expect(p.corpo).toBe('<p>corpo novo</p>') // texto sobreviveu
    expect(p.ordem).toBe(0)                    // move sobreviveu
  })
})

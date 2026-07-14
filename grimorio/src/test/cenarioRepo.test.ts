import { beforeEach, describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'

let fs: ReturnType<typeof criarFakeFs>

beforeEach(() => {
  fs = criarFakeFs()
})

describe('fakeFs.rename', () => {
  it('move um arquivo', async () => {
    await fs.writeTextAtomic('C:/Cofre/a/x.json', '1')
    await fs.rename('C:/Cofre/a/x.json', 'C:/Cofre/b/x.json')
    expect(await fs.readText('C:/Cofre/b/x.json')).toBe('1')
    expect(await fs.exists('C:/Cofre/a/x.json')).toBe(false)
  })

  it('move um diretório com toda a subárvore', async () => {
    await fs.writeTextAtomic('C:/Cofre/a/cidade/cenario.json', 'c')
    await fs.writeTextAtomic('C:/Cofre/a/cidade/bairro/cenario.json', 'b')
    await fs.mkdirAll('C:/Cofre/a/cidade/vazio')
    await fs.rename('C:/Cofre/a/cidade', 'C:/Cofre/b/cidade')
    expect(await fs.readText('C:/Cofre/b/cidade/cenario.json')).toBe('c')
    expect(await fs.readText('C:/Cofre/b/cidade/bairro/cenario.json')).toBe('b')
    expect(await fs.exists('C:/Cofre/b/cidade/vazio')).toBe(true)
    expect(await fs.exists('C:/Cofre/a/cidade')).toBe(false)
  })

  it('origem inexistente dá erro', async () => {
    await expect(fs.rename('C:/Cofre/nada', 'C:/Cofre/x')).rejects.toThrow()
  })
})

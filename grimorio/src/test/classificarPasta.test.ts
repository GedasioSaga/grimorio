import { describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { classificarPasta } from '../lib/classificarPasta'

describe('classificarPasta', () => {
  it('reconhece cofre pela pasta campanhas', async () => {
    const fs = criarFakeFs()
    await fs.mkdirAll('C:/cofre/campanhas')
    expect(await classificarPasta('C:/cofre', fs)).toBe('cofre')
  })
  it('reconhece cofre por vinculos.json', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic('C:/cofre/vinculos.json', '{"vinculos":[]}')
    expect(await classificarPasta('C:/cofre', fs)).toBe('cofre')
  })
  it('pasta inexistente é vazia (vai ser criada)', async () => {
    const fs = criarFakeFs()
    expect(await classificarPasta('C:/nova', fs)).toBe('vazia')
  })
  it('pasta com outros arquivos e sem marcador é estranha', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic('C:/downloads/nota.txt', 'oi')
    expect(await classificarPasta('C:/downloads', fs)).toBe('estranha')
  })
  it('aceita caminho com barra invertida', async () => {
    const fs = criarFakeFs()
    await fs.mkdirAll('C:/cofre/canvases-soltos')
    expect(await classificarPasta('C:\\cofre', fs)).toBe('cofre')
  })
})

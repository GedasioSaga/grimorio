import { describe, expect, it } from 'vitest'
import { criarVarreduraNoDisco } from '../lib/sync/disco'
import { varrerCofre } from '../lib/sync/varrer'
import type { EntradaDeDiretorio, FsBridge } from '../lib/fsBridge'
import type { EntradaArquivo } from '../lib/sync/tipos'
import { criarFakeFs } from './fakeFs'

const RAIZ = 'C:/Cofre/RPG'

function entrada(over: Partial<EntradaDeDiretorio> = {}): EntradaDeDiretorio {
  return { name: 'gandalf.json', isDir: false, size: 10, mtime: 1000, ...over }
}

/** Um `FsBridge` cuja única resposta interessante é a listagem, por diretório absoluto. */
function fsQueLista(arvore: Record<string, EntradaDeDiretorio[]>): FsBridge {
  return { ...criarFakeFs(), async listDir(caminho) { return arvore[caminho] ?? [] } }
}

function criarPorta(arvore: Record<string, EntradaDeDiretorio[]>) {
  const hasheados: string[] = []
  const porta = criarVarreduraNoDisco(fsQueLista(arvore), async (caminho) => {
    hasheados.push(caminho)
    return `sha(${caminho})`
  })
  return { porta, hasheados }
}

describe('criarVarreduraNoDisco', () => {
  it('traduz a entrada do FsBridge para a forma que a varredura consome', async () => {
    const { porta } = criarPorta({
      [RAIZ]: [entrada(), entrada({ name: 'campanhas', isDir: true, size: null, mtime: null })],
    })

    expect(await porta.listar(RAIZ)).toEqual([
      { nome: 'gandalf.json', ehDir: false, tamanho: 10, mtime: 1000 },
      { nome: 'campanhas', ehDir: true, tamanho: 0, mtime: 0 },
    ])
  })

  it('repassa o caminho absoluto intacto para o comando de hash', async () => {
    const { porta, hasheados } = criarPorta({})

    expect(await porta.hashArquivo(`${RAIZ}/gandalf.json`)).toBe(`sha(${RAIZ}/gandalf.json)`)
    expect(hasheados).toEqual([`${RAIZ}/gandalf.json`])
  })

  it('metadado ilegível não some da listagem — sumir viraria "apagar do Drive"', async () => {
    const { porta } = criarPorta({ [RAIZ]: [entrada({ size: null, mtime: null })] })

    expect((await porta.listar(RAIZ)).map((i) => i.nome)).toEqual(['gandalf.json'])
  })
})

describe('a porta ligada em varrerCofre', () => {
  const conhecido: Record<string, EntradaArquivo> = {
    'gandalf.json': { fileId: 'f1', hash: 'H0', tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v1' },
  }

  it('pula o hash quando tamanho e mtime do disco batem com o manifesto', async () => {
    const { porta, hasheados } = criarPorta({ [RAIZ]: [entrada()] })

    const local = await varrerCofre(RAIZ, conhecido, porta)

    expect(hasheados).toEqual([])
    expect(local.get('gandalf.json')).toEqual({ hash: 'H0', tamanho: 10, mtime: 1000 })
  })

  it('arquivo com metadado ilegível é rehasheado mesmo estando no manifesto', async () => {
    const { porta, hasheados } = criarPorta({ [RAIZ]: [entrada({ size: null, mtime: null })] })

    const local = await varrerCofre(RAIZ, conhecido, porta)

    expect(hasheados).toEqual([`${RAIZ}/gandalf.json`])
    expect(local.get('gandalf.json')?.hash).toBe(`sha(${RAIZ}/gandalf.json)`)
  })
})

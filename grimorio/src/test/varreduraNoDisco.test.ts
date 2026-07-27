import { describe, expect, it } from 'vitest'
import { criarSondagemNoDisco, criarVarreduraNoDisco } from '../lib/sync/disco'
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

describe('criarSondagemNoDisco', () => {
  function criarSonda(arvore: Record<string, EntradaDeDiretorio[]>, hash = 'HASH') {
    const hasheados: string[] = []
    const sondar = criarSondagemNoDisco(fsQueLista(arvore), async (caminho) => {
      hasheados.push(caminho)
      if (hash === 'ERRO') throw new Error(`não deu para ler ${caminho}`)
      return hash
    })
    return { sondar, hasheados }
  }

  it('devolve o que ficou no disco: hash relido, tamanho e mtime da listagem', async () => {
    const { sondar, hasheados } = criarSonda({ [RAIZ]: [entrada({ size: 42, mtime: 9000 })] })

    expect(await sondar(`${RAIZ}/gandalf.json`)).toEqual({ hash: 'HASH', tamanho: 42, mtime: 9000 })
    // o hash sai do arquivo, nunca do `sha256Checksum` do Drive: ele é opcional lá, e um
    // manifesto que descrevesse a promessa em vez do disco baixaria o arquivo a cada ciclo
    expect(hasheados).toEqual([`${RAIZ}/gandalf.json`])
  })

  it('caminho do Windows encontra o arquivo do mesmo jeito', async () => {
    const { sondar } = criarSonda({ [RAIZ]: [entrada({ size: 42, mtime: 9000 })] })

    expect(await sondar('C:\\Cofre\\RPG\\gandalf.json')).toEqual({
      hash: 'HASH',
      tamanho: 42,
      mtime: 9000,
    })
  })

  it('caixa diferente ainda é o mesmo arquivo no Windows', async () => {
    // O Drive distingue `Gandalf.json` de `gandalf.json` e o Windows não: o download grava no
    // arquivo que já existia, e o disco devolve a caixa ORIGINAL na listagem.
    const { sondar } = criarSonda({ [RAIZ]: [entrada({ name: 'Gandalf.json', size: 42, mtime: 9000 })] })

    expect(await sondar(`${RAIZ}/gandalf.json`)).toEqual({ hash: 'HASH', tamanho: 42, mtime: 9000 })
  })

  it('metadado que não aparece vira 0/0, e o hash continua valendo', async () => {
    // Degradação em custo, não em correção: com 0/0 no manifesto a varredura seguinte não pula o
    // hash, recalcula, acha o mesmo e conclui "igual".
    const { sondar } = criarSonda({ [RAIZ]: [] })

    expect(await sondar(`${RAIZ}/gandalf.json`)).toEqual({ hash: 'HASH', tamanho: 0, mtime: 0 })
  })

  it('pasta que nem lista cai no mesmo 0/0 em vez de derrubar a ação', async () => {
    const fs: FsBridge = {
      ...criarFakeFs(),
      async listDir() { throw new Error('acesso negado') },
    }
    const sondar = criarSondagemNoDisco(fs, async () => 'HASH')

    expect(await sondar(`${RAIZ}/gandalf.json`)).toEqual({ hash: 'HASH', tamanho: 0, mtime: 0 })
  })

  it('hash que falha PROPAGA — é o download que não chegou ao disco', async () => {
    // A ação tem de constar como falha para o manifesto guardar a entrada anterior e o ciclo
    // seguinte tentar de novo. Devolver um estado inventado esconderia a divergência para sempre.
    const { sondar } = criarSonda({ [RAIZ]: [entrada()] }, 'ERRO')

    await expect(sondar(`${RAIZ}/gandalf.json`)).rejects.toThrow('não deu para ler')
  })
})

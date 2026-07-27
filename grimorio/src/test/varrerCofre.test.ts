import { describe, expect, it } from 'vitest'
import { varrerCofre, type DependenciasDaVarredura, type ItemNoDisco } from '../lib/sync/varrer'
import type { EntradaArquivo } from '../lib/sync/tipos'

const RAIZ = 'C:/Cofre/RPG'

function ent(over: Partial<EntradaArquivo> = {}): EntradaArquivo {
  return { fileId: 'f1', hash: 'H0', tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v1', ...over }
}

function arq(nome: string, over: Partial<ItemNoDisco> = {}): ItemNoDisco {
  return { nome, ehDir: false, tamanho: 10, mtime: 1000, ...over }
}

function dir(nome: string): ItemNoDisco {
  return { nome, ehDir: true, tamanho: 0, mtime: 0 }
}

/** `arvore` mapeia caminho absoluto de diretório → entradas. `hasheados` registra o que foi lido. */
function criarDeps(arvore: Record<string, ItemNoDisco[]>) {
  const hasheados: string[] = []
  const erros = new Map<string, unknown>()

  const deps: DependenciasDaVarredura = {
    async listar(caminho) {
      if (erros.has(caminho)) throw erros.get(caminho)
      return arvore[caminho] ?? []
    },
    async hashArquivo(caminho) {
      hasheados.push(caminho)
      return `sha(${caminho})`
    },
  }

  return { deps, hasheados, erros }
}

describe('varrerCofre', () => {
  it('devolve caminhos relativos canônicos, com / em todos os níveis', async () => {
    const { deps } = criarDeps({
      [RAIZ]: [arq('vinculos.json'), dir('campanhas')],
      [`${RAIZ}/campanhas`]: [dir('aventura')],
      [`${RAIZ}/campanhas/aventura`]: [arq('gandalf.json')],
    })

    const local = await varrerCofre(RAIZ, {}, deps)

    expect([...local.keys()]).toEqual(['vinculos.json', 'campanhas/aventura/gandalf.json'])
    expect(local.get('campanhas/aventura/gandalf.json')).toEqual({
      hash: `sha(${RAIZ}/campanhas/aventura/gandalf.json)`,
      tamanho: 10,
      mtime: 1000,
    })
  })

  it('barra final na raiz não vira barra dobrada no caminho absoluto', async () => {
    const { deps, hasheados } = criarDeps({ [RAIZ]: [arq('a.json')] })

    await varrerCofre(`${RAIZ}/`, {}, deps)

    expect(hasheados).toEqual([`${RAIZ}/a.json`])
  })

  it('raiz com barra invertida do Windows é normalizada antes de descer', async () => {
    const { deps } = criarDeps({ [RAIZ]: [arq('a.json')] })

    const local = await varrerCofre('C:\\Cofre\\RPG', {}, deps)

    expect([...local.keys()]).toEqual(['a.json'])
  })

  it('pula o hash quando tamanho e mtime batem com o manifesto', async () => {
    const { deps, hasheados } = criarDeps({ [RAIZ]: [arq('a.json')] })

    const local = await varrerCofre(RAIZ, { 'a.json': ent() }, deps)

    expect(hasheados).toEqual([])
    expect(local.get('a.json')).toEqual({ hash: 'H0', tamanho: 10, mtime: 1000 })
  })

  it('mtime diferente força o hash, mesmo com o tamanho igual', async () => {
    const { deps, hasheados } = criarDeps({ [RAIZ]: [arq('a.json', { mtime: 2000 })] })

    const local = await varrerCofre(RAIZ, { 'a.json': ent() }, deps)

    expect(hasheados).toEqual([`${RAIZ}/a.json`])
    expect(local.get('a.json')).toEqual({ hash: `sha(${RAIZ}/a.json)`, tamanho: 10, mtime: 2000 })
  })

  it('tamanho diferente força o hash, mesmo com o mtime igual', async () => {
    const { deps, hasheados } = criarDeps({ [RAIZ]: [arq('a.json', { tamanho: 99 })] })

    await varrerCofre(RAIZ, { 'a.json': ent() }, deps)

    expect(hasheados).toEqual([`${RAIZ}/a.json`])
  })

  it('pasta que não pôde ser lida derruba a varredura em vez de fingir que está vazia', async () => {
    const { deps, erros } = criarDeps({
      [RAIZ]: [dir('campanhas')],
      [`${RAIZ}/campanhas`]: [arq('a.json')],
    })
    erros.set(`${RAIZ}/campanhas`, new Error('acesso negado'))

    await expect(varrerCofre(RAIZ, {}, deps)).rejects.toThrow('acesso negado')
  })
})

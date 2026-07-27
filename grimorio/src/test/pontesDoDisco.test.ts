import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * As duas pontes finas do disco: `list_dir` (`fsBridge.ts`) e os comandos de hash
 * (`hashBridge.ts`).
 *
 * Elas não têm lógica, mas têm duas coisas que só quebram em tempo de execução e que nenhum
 * outro teste pega, porque todo o resto do sync roda contra um `FsBridge` falso: o NOME do
 * comando registrado no `generate_handler!` e a CHAVE de cada argumento, que o Tauri casa com o
 * nome do parâmetro no Rust. Errar qualquer um dos dois dá "comando não encontrado" ou
 * "argumento faltando" com o app já rodando.
 */

const espiao = vi.hoisted(() => ({
  chamadas: [] as { comando: string; args: Record<string, unknown> }[],
  respostas: new Map<string, unknown>(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (comando: string, args: Record<string, unknown>) => {
    espiao.chamadas.push({ comando, args })
    return espiao.respostas.get(comando)
  },
}))

const { tauriFs } = await import('../lib/fsBridge')
const { hashArquivo, hashTexto } = await import('../lib/hashBridge')

beforeEach(() => {
  espiao.chamadas = []
  espiao.respostas.clear()
})

describe('tauriFs.listDir', () => {
  it('chama list_dir com a chave `path` e traduz os campos do Rust', async () => {
    espiao.respostas.set('list_dir', [
      { name: 'gandalf.json', is_dir: false, size: 1234, mtime: 1_753_000_000_123 },
      { name: 'campanhas', is_dir: true, size: 0, mtime: 1_753_000_000_000 },
    ])

    const entradas = await tauriFs.listDir('C:/Cofre/RPG')

    expect(espiao.chamadas).toEqual([{ comando: 'list_dir', args: { path: 'C:/Cofre/RPG' } }])
    expect(entradas).toEqual([
      { name: 'gandalf.json', isDir: false, size: 1234, mtime: 1_753_000_000_123 },
      { name: 'campanhas', isDir: true, size: 0, mtime: 1_753_000_000_000 },
    ])
  })

  it('o metadado nulo do Rust atravessa como nulo, sem virar 0 no caminho', async () => {
    espiao.respostas.set('list_dir', [{ name: 'travado.json', is_dir: false, size: null, mtime: null }])

    // Quem decide o que fazer com o "não sei" é `disco.ts`; confundir isso com 0 aqui esconderia
    // o caso dele, e um arquivo ilegível passaria por inalterado.
    expect(await tauriFs.listDir('C:/Cofre/RPG')).toEqual([
      { name: 'travado.json', isDir: false, size: null, mtime: null },
    ])
  })
})

describe('ponte de hash', () => {
  it('hashArquivo chama hash_arquivo com a chave `path`', async () => {
    espiao.respostas.set('hash_arquivo', 'abc123')

    expect(await hashArquivo('C:/Cofre/RPG/gandalf.json')).toBe('abc123')
    expect(espiao.chamadas).toEqual([
      { comando: 'hash_arquivo', args: { path: 'C:/Cofre/RPG/gandalf.json' } },
    ])
  })

  it('hashTexto chama hash_texto com a chave `texto`', async () => {
    espiao.respostas.set('hash_texto', 'deadbeef')

    expect(await hashTexto('C:/Cofre/RPG')).toBe('deadbeef')
    expect(espiao.chamadas).toEqual([{ comando: 'hash_texto', args: { texto: 'C:/Cofre/RPG' } }])
  })
})

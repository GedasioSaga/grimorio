import { describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { diretorioDoManifesto, gravarManifesto, lerManifesto, rotacionar } from '../lib/sync/manifesto'
import type { Manifesto } from '../lib/sync/tipos'

const DIR = 'C:/AppData/Roaming/grimorio/cofres/a1b2c3d4e5f60718'
const CAMINHO_ATUAL = `${DIR}/manifesto.json`
const CAMINHO_ANTERIOR = `${DIR}/manifesto.anterior.json`

function manifesto(sobrescreve: Partial<Manifesto> = {}): Manifesto {
  return {
    versao: 1,
    cofreId: 'cofre-1',
    pastaRaizId: 'raiz-1',
    startPageToken: '42',
    deviceId: 'dev-1',
    deviceNome: 'PC Casa',
    ultimoSync: '2026-07-26T10:00:00.000Z',
    pastas: { campanhas: 'pasta-1' },
    arquivos: {
      'campanhas/x/personagens/gandalf.json': {
        fileId: 'f1', hash: 'h1', tamanho: 120, mtimeLocal: 1700000000000, versaoRemota: 'v1',
      },
    },
    ...sobrescreve,
  }
}

/** hash_texto é determinístico e nunca rejeita; o fake só precisa dessas duas propriedades. */
const hashFake = async (texto: string) => `hash(${texto})`

/**
 * fs que RECUSA escrever em diretório não criado. O fake padrão aceita qualquer caminho e o
 * `write_text_file_atomic` do Rust faz `create_dir_all` sozinho — nos dois casos um `mkdirAll`
 * esquecido passaria despercebido, e passaria a depender do backend.
 */
function fsQueExigeDiretorio() {
  const fs = criarFakeFs()
  const criados = new Set<string>()
  return {
    ...fs,
    async mkdirAll(p: string) {
      criados.add(p)
      await fs.mkdirAll(p)
    },
    async writeTextAtomic(p: string, conteudo: string) {
      const dir = p.slice(0, p.lastIndexOf('/'))
      if (!criados.has(dir)) throw new Error(`diretório não existe: ${dir}`)
      await fs.writeTextAtomic(p, conteudo)
    },
  }
}

/** Grava `bruto` como manifesto corrente sobre uma cópia anterior válida e devolve o que a leitura enxergou. */
async function lerComAtualInvalido(bruto: string, anterior: Manifesto) {
  const fs = criarFakeFs()
  await fs.writeTextAtomic(CAMINHO_ANTERIOR, JSON.stringify(anterior))
  await fs.writeTextAtomic(CAMINHO_ATUAL, bruto)
  return lerManifesto(DIR, fs)
}

describe('lerManifesto / gravarManifesto', () => {
  it('ida e volta: o que grava é o que lê', async () => {
    const fs = criarFakeFs()
    const m = manifesto()
    await gravarManifesto(DIR, m, fs)
    expect(await lerManifesto(DIR, fs)).toEqual(m)
  })

  it('sem nenhuma das duas cópias é primeiro sync (null)', async () => {
    expect(await lerManifesto(DIR, criarFakeFs())).toBeNull()
  })

  it('manifesto.json truncado cai na cópia anterior', async () => {
    const anterior = manifesto({ startPageToken: '41' })
    const truncado = JSON.stringify(manifesto()).slice(0, 40)
    expect(() => JSON.parse(truncado)).toThrow() // garante que o caso testa corrupção de verdade
    expect(await lerComAtualInvalido(truncado, anterior)).toEqual(anterior)
  })

  it('as duas cópias corrompidas viram null, sem lançar', async () => {
    const fs = criarFakeFs()
    await fs.writeTextAtomic(CAMINHO_ATUAL, '{"versao":1,')
    await fs.writeTextAtomic(CAMINHO_ANTERIOR, 'nada disso é json')
    await expect(lerManifesto(DIR, fs)).resolves.toBeNull()
  })

  it('sem manifesto.json, lê a cópia anterior', async () => {
    const fs = criarFakeFs()
    const anterior = manifesto({ ultimoSync: '2026-07-25T00:00:00.000Z' })
    await fs.writeTextAtomic(CAMINHO_ANTERIOR, JSON.stringify(anterior))
    expect(await lerManifesto(DIR, fs)).toEqual(anterior)
  })

  it('gravarManifesto cria o diretório que ainda não existe', async () => {
    const fs = fsQueExigeDiretorio()
    const m = manifesto()
    await gravarManifesto(DIR, m, fs)
    expect(await lerManifesto(DIR, fs)).toEqual(m)
  })
})

describe('guarda de forma do manifesto', () => {
  const anterior = manifesto({ startPageToken: '41' })

  it('json válido que não é manifesto cai na cópia anterior', async () => {
    expect(await lerComAtualInvalido('{"versao":1,"arquivos":"isso não é um mapa"}', anterior)).toEqual(anterior)
  })

  it('arquivos/pastas em forma de array cai na cópia anterior', async () => {
    // Array passa em `typeof === 'object'`, e `Object.entries([])` dá zero arquivos conhecidos: o
    // motor mandaria SUBIR o cofre inteiro. O freio de deleção em massa não pega isso — ele exige
    // um mínimo de arquivos conhecidos, e aqui o total é justamente zero.
    expect(await lerComAtualInvalido('{"versao":1,"arquivos":[],"pastas":[]}', anterior)).toEqual(anterior)
  })

  it('entrada nula em arquivos cai na cópia anterior', async () => {
    // null passa na checagem de topo e só estoura lá dentro, comparando `atual.hash === entrada.hash`
    expect(await lerComAtualInvalido('{"versao":1,"arquivos":{"a.json":null},"pastas":{}}', anterior)).toEqual(anterior)
  })

  it('entrada sem os campos de EntradaArquivo cai na cópia anterior', async () => {
    expect(await lerComAtualInvalido('{"versao":1,"arquivos":{"a.json":{"fileId":"f1"}},"pastas":{}}', anterior))
      .toEqual(anterior)
  })

  it('pastas com valor que não é string cai na cópia anterior', async () => {
    expect(await lerComAtualInvalido('{"versao":1,"arquivos":{},"pastas":{"campanhas":7}}', anterior)).toEqual(anterior)
  })
})

describe('rotacionar', () => {
  it('copia o corrente por cima da cópia anterior, e ler continua devolvendo o corrente', async () => {
    const fs = criarFakeFs()
    const novo = manifesto({ startPageToken: '11' })
    await fs.writeTextAtomic(CAMINHO_ANTERIOR, JSON.stringify(manifesto({ startPageToken: '10' })))
    await gravarManifesto(DIR, novo, fs)
    await rotacionar(DIR, fs)
    expect(JSON.parse(await fs.readText(CAMINHO_ANTERIOR))).toEqual(novo)
    expect(await lerManifesto(DIR, fs)).toEqual(novo)
  })

  it('gravar NÃO rotaciona: a cópia anterior só muda depois do ciclo completo', async () => {
    const fs = criarFakeFs()
    const velho = manifesto({ startPageToken: '10' })
    await fs.writeTextAtomic(CAMINHO_ANTERIOR, JSON.stringify(velho))
    await gravarManifesto(DIR, manifesto({ startPageToken: '11' }), fs)
    expect(JSON.parse(await fs.readText(CAMINHO_ANTERIOR))).toEqual(velho)
  })
})

describe('diretorioDoManifesto', () => {
  it('monta <appConfigDir>/cofres/<hash>', async () => {
    const dir = await diretorioDoManifesto('C:/Users/g/AppData/Roaming/grimorio', 'C:/Cofre/RPG', async () => 'a1b2c3d4')
    expect(dir).toBe('C:/Users/g/AppData/Roaming/grimorio/cofres/a1b2c3d4')
  })

  it('aceita appConfigDir com barra invertida e com barra final', async () => {
    const dir = await diretorioDoManifesto('C:\\Users\\g\\AppData\\Roaming\\grimorio\\', 'C:/Cofre/RPG', async () => 'a1b2c3d4')
    expect(dir).toBe('C:/Users/g/AppData/Roaming/grimorio/cofres/a1b2c3d4')
  })

  it('o mesmo cofre escrito com \\ ou / cai no mesmo diretório', async () => {
    expect(await diretorioDoManifesto('C:/cfg', 'C:\\Cofre\\RPG', hashFake))
      .toBe(await diretorioDoManifesto('C:/cfg', 'C:/Cofre/RPG', hashFake))
  })

  it('o que chega ao hash é o caminho normalizado, não o cru', async () => {
    // o chamador entrega o caminho e a função: normalizar antes de hashear não é pulável
    const vistos: string[] = []
    await diretorioDoManifesto('C:/cfg', 'C:\\Cofre\\RPG', async (texto) => {
      vistos.push(texto)
      return 'h'
    })
    expect(vistos).toEqual(['C:/Cofre/RPG'])
  })
})

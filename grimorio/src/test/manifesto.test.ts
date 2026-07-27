import { describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import { chaveDoCofre, diretorioDoManifesto, gravarManifesto, lerManifesto, rotacionar } from '../lib/sync/manifesto'
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
    const fs = criarFakeFs()
    const anterior = manifesto({ startPageToken: '41' })
    const truncado = JSON.stringify(manifesto()).slice(0, 40)
    expect(() => JSON.parse(truncado)).toThrow() // garante que o caso testa corrupção de verdade
    await fs.writeTextAtomic(CAMINHO_ANTERIOR, JSON.stringify(anterior))
    await fs.writeTextAtomic(CAMINHO_ATUAL, truncado)
    expect(await lerManifesto(DIR, fs)).toEqual(anterior)
  })

  it('json válido que não é manifesto também cai na cópia anterior', async () => {
    const fs = criarFakeFs()
    const anterior = manifesto({ startPageToken: '41' })
    await fs.writeTextAtomic(CAMINHO_ANTERIOR, JSON.stringify(anterior))
    await fs.writeTextAtomic(CAMINHO_ATUAL, '{"versao":1,"arquivos":"isso não é um mapa"}')
    expect(await lerManifesto(DIR, fs)).toEqual(anterior)
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
  it('monta <appConfigDir>/cofres/<hash>', () => {
    expect(diretorioDoManifesto('C:/Users/g/AppData/Roaming/grimorio', 'a1b2c3d4e5f60718'))
      .toBe('C:/Users/g/AppData/Roaming/grimorio/cofres/a1b2c3d4e5f60718')
  })

  it('aceita appConfigDir com barra invertida e com barra final', () => {
    expect(diretorioDoManifesto('C:\\Users\\g\\AppData\\Roaming\\grimorio\\', 'a1b2c3d4e5f60718'))
      .toBe('C:/Users/g/AppData/Roaming/grimorio/cofres/a1b2c3d4e5f60718')
  })

  it('o mesmo cofre escrito com \\ ou / cai no mesmo diretório', () => {
    // hash_texto é determinístico: mesma entrada, mesma saída. Só a normalização decide aqui.
    const hashFake = (texto: string) => `hash(${texto})`
    const dirDe = (cofre: string) => diretorioDoManifesto('C:/cfg', hashFake(chaveDoCofre(cofre)))
    expect(dirDe('C:\\Cofre\\RPG')).toBe(dirDe('C:/Cofre/RPG'))
  })
})

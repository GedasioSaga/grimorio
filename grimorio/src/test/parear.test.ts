import { describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import type { FsBridge } from '../lib/fsBridge'
import { executarCiclo, type DependenciasDoSync } from '../lib/sync/ciclo'
import type { ClienteDrive, ConteudoRemoto, ItemRemoto } from '../lib/sync/driveBridge'
import { lerManifesto } from '../lib/sync/manifesto'
import {
  inspecionarNuvem,
  outroSincronizadorNoCaminho,
  parear,
  primeiroManifesto,
  type IdentidadeDoPareamento,
} from '../lib/sync/parear'
import { textoDoPareamento } from '../lib/painelSync'
import type { EstadoLocal, Manifesto } from '../lib/sync/tipos'

/**
 * O pareamento — o momento em que um cofre passa a ter uma pasta no Drive e um manifesto.
 *
 * O que estes testes existem para provar é UMA coisa: as duas histórias (primeiro computador, com
 * o Drive vazio; segundo computador, com um cofre já lá) terminam certas, e a segunda **não pode
 * apagar** o que a primeira enviou. Por isso a maior parte deles não para no manifesto recém-nascido
 * — roda o ciclo de verdade em cima dele e afirma o plano que saiu.
 */

const RAIZ_LOCAL = 'C:/Cofre/RPG'
const DIR = 'C:/Config/cofres/abc123'
const ATUAL = `${DIR}/manifesto.json`
const RAIZ_DRIVE = 'raizGrimorio'
const PASTA_COFRE = 'pastaDoCofre'
const AGORA = '2026-07-27T12:00:00.000Z'

const IDENTIDADE: IdentidadeDoPareamento = {
  cofreId: 'cofre-1',
  deviceId: 'dev-1',
  deviceNome: 'PC Casa',
}

function item(over: Partial<ItemRemoto> = {}): ItemRemoto {
  return {
    caminho: 'a.json',
    fileId: 'f1',
    hash: 'H0',
    versao: 'v1',
    tamanho: 10,
    modificadoEm: null,
    deviceNome: null,
    ...over,
  }
}

function loc(over: Partial<EstadoLocal> = {}): EstadoLocal {
  return { hash: 'H0', tamanho: 10, mtime: 1000, ...over }
}

/**
 * Drive falso com uma pasta raiz e uma listagem fixa para o cofre. `chamadas` prova o que o
 * pareamento tocou de verdade — inclusive que ele não apagou nada.
 */
function criarFakeDrive(fs: FsBridge, listagem: ConteudoRemoto) {
  const chamadas: string[] = []
  const drive: ClienteDrive = {
    async pastaRaiz() {
      chamadas.push('pastaRaiz')
      return RAIZ_DRIVE
    },
    async garantirPasta(pastaMaeId, caminho) {
      chamadas.push(`garantirPasta:${pastaMaeId}/${caminho}`)
      return caminho === 'RPG' ? PASTA_COFRE : `id(${caminho})`
    },
    async listar(pastaRaizId) {
      chamadas.push(`listar:${pastaRaizId}`)
      return listagem
    },
    async enviar(pedido) {
      chamadas.push(`enviar:${pedido.nome}`)
      return { fileId: `novo(${pedido.nome})`, hash: null, versao: 'v9', tamanho: null }
    },
    async baixar(fileId, caminhoLocal) {
      chamadas.push(`baixar:${fileId}`)
      await fs.writeTextAtomic(caminhoLocal, `conteúdo de ${fileId}`)
    },
    async apagar(fileId) {
      chamadas.push(`apagar:${fileId}`)
    },
  }
  return { drive, chamadas }
}

/** O ciclo real montado sobre o manifesto que o pareamento acabou de gravar. */
function cicloSobre(fs: FsBridge, drive: ClienteDrive, local: Record<string, EstadoLocal>): DependenciasDoSync {
  return {
    fs,
    drive,
    dirManifesto: DIR,
    raizLocal: RAIZ_LOCAL,
    async descarregarFilas() { return [] },
    async varrerLocal() { return new Map(Object.entries(local)) },
    async sondarLocal(caminho) {
      const conteudo = await fs.readText(caminho)
      return { hash: `sha(${conteudo})`, tamanho: conteudo.length, mtime: 7000 }
    },
    preservador: () => async () => {},
    agora: () => AGORA,
  }
}

async function pareado(fs: FsBridge): Promise<Manifesto> {
  return parear({ fs, dirManifesto: DIR, pastaCofreId: PASTA_COFRE, identidade: IDENTIDADE, agora: () => AGORA })
}

describe('primeiroManifesto', () => {
  it('nasce VAZIO — é o que faz as duas histórias darem certo', async () => {
    const m = primeiroManifesto(PASTA_COFRE, IDENTIDADE, AGORA)

    // Um manifesto que afirmasse conhecer arquivos nunca sincronizados abriria a porta para
    // `apagarLocal`/`apagarRemoto` já no primeiro ciclo — a matriz COM manifesto é a única que os
    // emite. Vazio, só existe subir, baixar, registrar e conflito.
    expect(m.arquivos).toEqual({})
    expect(m.pastas).toEqual({})
    expect(m).toMatchObject({
      versao: 1,
      cofreId: 'cofre-1',
      pastaRaizId: PASTA_COFRE,
      deviceId: 'dev-1',
      deviceNome: 'PC Casa',
      ultimoSync: AGORA,
    })
  })
})

describe('inspecionarNuvem', () => {
  it('acha (ou cria) a pasta do cofre e conta o que já existe lá', async () => {
    const fs = criarFakeFs()
    const { drive, chamadas } = criarFakeDrive(fs, { pastas: [], arquivos: [item(), item({ caminho: 'b.json' })] })

    expect(await inspecionarNuvem(drive, 'RPG')).toEqual({ pastaCofreId: PASTA_COFRE, arquivos: 2 })
    expect(chamadas).toEqual(['pastaRaiz', `garantirPasta:${RAIZ_DRIVE}/RPG`, `listar:${PASTA_COFRE}`])
  })

  it('Drive vazio devolve zero arquivos, e não grava nada no disco', async () => {
    const fs = criarFakeFs()
    const { drive } = criarFakeDrive(fs, { pastas: [], arquivos: [] })

    expect((await inspecionarNuvem(drive, 'RPG')).arquivos).toBe(0)
    expect(fs.arquivos.size).toBe(0)
  })
})

describe('parear', () => {
  it('grava o primeiro manifesto no diretório do cofre', async () => {
    const fs = criarFakeFs()

    const m = await pareado(fs)

    expect(await lerManifesto(DIR, fs)).toEqual(m)
    expect(JSON.parse(fs.arquivos.get(ATUAL)!).pastaRaizId).toBe(PASTA_COFRE)
  })

  it('parear de novo NÃO sobrescreve o manifesto do último sync', async () => {
    const fs = criarFakeFs()
    await pareado(fs)
    // simula um ciclo já ocorrido: o manifesto passa a conhecer um arquivo
    const usado: Manifesto = {
      ...(await lerManifesto(DIR, fs))!,
      arquivos: { 'a.json': { fileId: 'f1', hash: 'H0', tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v1' } },
    }
    fs.arquivos.set(ATUAL, JSON.stringify(usado))

    const devolvido = await parear({
      fs, dirManifesto: DIR, pastaCofreId: 'outraPasta', identidade: IDENTIDADE, agora: () => 'depois',
    })

    // zerar aqui faria todo arquivo divergente virar cópia de conflito no ciclo seguinte
    expect(devolvido).toEqual(usado)
    expect(await lerManifesto(DIR, fs)).toEqual(usado)
  })
})

describe('primeiro computador: o Drive está vazio', () => {
  it('o cofre inteiro sobe, e nada é apagado', async () => {
    const fs = criarFakeFs()
    const { drive, chamadas } = criarFakeDrive(fs, { pastas: [], arquivos: [] })
    await pareado(fs)

    const r = await executarCiclo(cicloSobre(fs, drive, { 'a.json': loc(), 'campanhas/b.json': loc({ hash: 'H1' }) }))

    expect(r.tipo).toBe('sincronizado')
    expect(chamadas).toEqual([
      `listar:${PASTA_COFRE}`,
      'enviar:a.json',
      `garantirPasta:${PASTA_COFRE}/campanhas`,
      'enviar:b.json',
    ])
    expect(chamadas.some((c) => c.startsWith('apagar:'))).toBe(false)
  })
})

describe('segundo computador: o Drive já tem o cofre', () => {
  it('o que só existe lá DESCE, e nada do que está lá é apagado', async () => {
    const fs = criarFakeFs()
    const { drive, chamadas } = criarFakeDrive(fs, { pastas: [], arquivos: [item(), item({ caminho: 'b.json', fileId: 'f2' })] })
    await pareado(fs)

    // pasta local vazia: é o caso de baixar o cofre num computador novo
    const r = await executarCiclo(cicloSobre(fs, drive, {}))

    expect(r.tipo).toBe('sincronizado')
    expect(chamadas).toEqual([`listar:${PASTA_COFRE}`, 'baixar:f1', 'baixar:f2'])
    expect(chamadas.some((c) => c.startsWith('apagar:'))).toBe(false)
  })

  it('cópia idêntica dos dois lados só é REGISTRADA — não sobe nem desce o cofre inteiro', async () => {
    const fs = criarFakeFs()
    const { drive, chamadas } = criarFakeDrive(fs, { pastas: [], arquivos: [item({ hash: 'H0' })] })
    await pareado(fs)

    const r = await executarCiclo(cicloSobre(fs, drive, { 'a.json': loc({ hash: 'H0' }) }))

    expect(r.tipo).toBe('sincronizado')
    if (r.tipo !== 'sincronizado') return
    expect(chamadas).toEqual([`listar:${PASTA_COFRE}`])
    expect(r.manifesto.arquivos['a.json']).toEqual({
      fileId: 'f1', hash: 'H0', tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v1',
    })
  })

  it('versões diferentes viram CONFLITO com o perdedor preservado, nunca deleção', async () => {
    const fs = criarFakeFs()
    const { drive, chamadas } = criarFakeDrive(fs, { pastas: [], arquivos: [item({ hash: 'H-remoto' })] })
    await pareado(fs)

    const preservados: string[] = []
    const deps = cicloSobre(fs, drive, { 'a.json': loc({ hash: 'H-local' }) })
    const r = await executarCiclo({ ...deps, preservador: () => async (acao) => { preservados.push(acao.caminho) } })

    expect(r.tipo).toBe('sincronizado')
    expect(preservados).toEqual(['a.json'])
    expect(chamadas.some((c) => c.startsWith('apagar:'))).toBe(false)
  })

  it('nem com dezenas de arquivos só de um lado o pareamento apaga alguma coisa', async () => {
    // O freio de deleção em massa não engata com manifesto vazio (`total` é 0) — a proteção aqui
    // não é o freio, é a matriz: sem entrada no manifesto, `apagarLocal`/`apagarRemoto` não
    // existem como saída possível. Este é o teste que prova isso na escala em que doeria.
    const fs = criarFakeFs()
    const remotos = Array.from({ length: 30 }, (_, i) => item({ caminho: `f${i}.json`, fileId: `id${i}` }))
    const { drive, chamadas } = criarFakeDrive(fs, { pastas: [], arquivos: remotos })
    await pareado(fs)

    const r = await executarCiclo(cicloSobre(fs, drive, { 'so-daqui.json': loc({ hash: 'H9' }) }))

    expect(r.tipo).toBe('sincronizado')
    expect(chamadas.filter((c) => c.startsWith('baixar:'))).toHaveLength(30)
    expect(chamadas).toContain('enviar:so-daqui.json')
    expect(chamadas.some((c) => c.startsWith('apagar:'))).toBe(false)
  })
})

describe('outroSincronizadorNoCaminho', () => {
  it('acha a pasta corporativa do OneDrive, que não se chama só "OneDrive"', () => {
    expect(outroSincronizadorNoCaminho('C:/Users/ana/OneDrive - Vertis Capital/Cofre')).toBe('OneDrive')
  })

  it('acha os outros serviços, com barra do Windows e caixa qualquer', () => {
    expect(outroSincronizadorNoCaminho('C:\\Users\\ana\\Dropbox\\RPG')).toBe('Dropbox')
    expect(outroSincronizadorNoCaminho('C:/Users/ana/google drive/RPG')).toBe('Google Drive')
    expect(outroSincronizadorNoCaminho('C:/Users/ana/iCloudDrive/RPG')).toBe('iCloud')
  })

  it('não grita à toa por causa do NOME do cofre', () => {
    // `substring` no caminho inteiro acusaria este caso, e o aviso que grita à toa é o aviso que
    // o usuário aprende a ignorar.
    expect(outroSincronizadorNoCaminho('D:/RPG/Campanha do Dropbox')).toBe(null)
    expect(outroSincronizadorNoCaminho('D:/RPG/Cofre')).toBe(null)
  })
})

describe('textoDoPareamento', () => {
  it('Drive vazio conta a história do primeiro computador', () => {
    const texto = textoDoPareamento('RPG', 0)

    expect(texto).toContain('Ainda não há nada deste cofre no seu Google Drive')
    expect(texto).toContain('"Grimório/RPG"')
    expect(texto).not.toContain('juntados')
  })

  it('Drive com cofre avisa que os dois vão se juntar, e que nada é apagado', () => {
    const texto = textoDoPareamento('RPG', 12)

    expect(texto).toContain('12 arquivos')
    expect(texto).toContain('os dois são juntados')
    expect(texto).toContain('Nada é apagado, nem aqui nem lá')
  })

  it('um arquivo só não vira "1 arquivos"', () => {
    expect(textoDoPareamento('RPG', 1)).toContain('com 1 arquivo —')
  })
})

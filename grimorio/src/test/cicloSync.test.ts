import { describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import type { FsBridge } from '../lib/fsBridge'
import { executarCiclo, type DependenciasDoSync, type FalhaDeGravacao } from '../lib/sync/ciclo'
import type { AcaoConflito } from '../lib/sync/executar'
import type { ClienteDrive, ConteudoRemoto, ItemRemoto } from '../lib/sync/driveBridge'
import type { EntradaArquivo, EstadoLocal, EstadoRemoto, Manifesto } from '../lib/sync/tipos'

const RAIZ = 'C:/Cofre/RPG'
const DIR = 'C:/Config/cofres/abc123'
const ATUAL = `${DIR}/manifesto.json`
const ANTERIOR = `${DIR}/manifesto.anterior.json`
const AGORA = '2026-07-27T12:00:00.000Z'
const RAIZ_DRIVE = 'raizDrive'

function ent(over: Partial<EntradaArquivo> = {}): EntradaArquivo {
  return { fileId: 'f1', hash: 'H0', tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v1', ...over }
}

function loc(over: Partial<EstadoLocal> = {}): EstadoLocal {
  return { hash: 'H0', tamanho: 10, mtime: 1000, ...over }
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

function manifesto(over: Partial<Manifesto> = {}): Manifesto {
  return {
    versao: 1,
    cofreId: 'cofre-1',
    pastaRaizId: RAIZ_DRIVE,
    startPageToken: '900',
    deviceId: 'dev-1',
    deviceNome: 'PC Casa',
    ultimoSync: '2026-07-26T10:00:00.000Z',
    pastas: {},
    arquivos: { 'a.json': ent() },
    ...over,
  }
}

/** Cliente do Drive falso. `listagem` é o que `drive_listar` devolveria. */
function criarFakeDrive(fs: FsBridge, listagem: ConteudoRemoto) {
  const chamadas: string[] = []
  const falhas = new Map<string, unknown>()

  function registrar(assinatura: string): void {
    chamadas.push(assinatura)
    if (falhas.has(assinatura)) throw falhas.get(assinatura)
  }

  const drive: ClienteDrive = {
    async pastaRaiz() {
      registrar('pastaRaiz')
      return RAIZ_DRIVE
    },
    async garantirPasta(pastaMaeId, caminho) {
      registrar(`garantirPasta:${caminho}`)
      return `id(${pastaMaeId}/${caminho})`
    },
    async listar(pastaRaizId) {
      registrar(`listar:${pastaRaizId}`)
      return listagem
    },
    async enviar(pedido) {
      registrar(`enviar:${pedido.nome}`)
      return { fileId: pedido.fileId ?? `novo(${pedido.nome})`, hash: null, versao: 'v2', tamanho: null }
    },
    async baixar(fileId, caminhoLocal) {
      registrar(`baixar:${fileId}`)
      await fs.writeTextAtomic(caminhoLocal, `conteúdo de ${fileId}`)
    },
    async apagar(fileId) {
      registrar(`apagar:${fileId}`)
    },
  }

  return { drive, chamadas, falhas }
}

interface Cenario {
  /** Manifesto no disco. `null` = cofre nunca pareado. */
  anterior?: Manifesto | null
  local?: Record<string, EstadoLocal>
  listagem?: Partial<ConteudoRemoto>
  descarga?: FalhaDeGravacao[]
}

function montar(cenario: Cenario = {}) {
  const fs = criarFakeFs()
  const anterior = cenario.anterior === undefined ? manifesto() : cenario.anterior
  if (anterior !== null) fs.arquivos.set(ATUAL, JSON.stringify(anterior))

  const listagem: ConteudoRemoto = {
    pastas: cenario.listagem?.pastas ?? [],
    arquivos: cenario.listagem?.arquivos ?? [item()],
  }
  const { drive, chamadas, falhas } = criarFakeDrive(fs, listagem)

  // Ordem das etapas do ciclo, para provar que a fila é descarregada ANTES da leitura do cofre.
  const etapas: string[] = []
  const preservados: { acao: AcaoConflito; remoto: EstadoRemoto | undefined }[] = []

  const deps: DependenciasDoSync = {
    fs,
    drive,
    dirManifesto: DIR,
    raizLocal: RAIZ,
    async descarregarFilas() {
      etapas.push('descarregarFilas')
      return cenario.descarga ?? []
    },
    async varrerLocal() {
      etapas.push('varrerLocal')
      return new Map(Object.entries(cenario.local ?? { 'a.json': loc() }))
    },
    async sondarLocal(caminho) {
      const conteudo = await fs.readText(caminho)
      return { hash: `sha(${conteudo})`, tamanho: conteudo.length, mtime: 7000 }
    },
    // fábrica, porque a política real precisa do `deviceNome` e do `pastaRaizId` do manifesto —
    // que só existem depois de o ciclo lê-lo
    preservador: (manifesto) => async (acao, remoto) => {
      etapas.push(`preservarPerdedor:${manifesto.deviceNome}`)
      preservados.push({ acao, remoto })
    },
    agora: () => AGORA,
  }

  return { fs, deps, chamadas, falhas, etapas, preservados, listagem }
}

/** O manifesto gravado no disco, ou `undefined` se o ciclo não gravou nada. */
function lerDoDisco(fs: ReturnType<typeof criarFakeFs>, caminho: string): Manifesto | undefined {
  const bruto = fs.arquivos.get(caminho)
  return bruto === undefined ? undefined : (JSON.parse(bruto) as Manifesto)
}

describe('executarCiclo', () => {
  it('ciclo feliz: sobe o que mudou, grava o manifesto novo e promove o anterior a backup', async () => {
    const { fs, deps, chamadas } = montar({ local: { 'a.json': loc({ hash: 'H1' }) } })

    const r = await executarCiclo(deps)

    expect(r.tipo).toBe('sincronizado')
    if (r.tipo !== 'sincronizado') return
    expect(r.falhas).toEqual([])
    expect(chamadas).toContain('enviar:a.json')
    // o manifesto novo registra o upload (fileId e versão vieram do Drive, hash do lado local)
    expect(r.manifesto.arquivos['a.json']).toEqual({
      fileId: 'f1',
      hash: 'H1',
      tamanho: 10,
      mtimeLocal: 1000,
      versaoRemota: 'v2',
    })
    expect(r.manifesto.ultimoSync).toBe(AGORA)
    expect(lerDoDisco(fs, ATUAL)).toEqual(r.manifesto)
    // a rotação acontece ANTES da gravação: o backup é o manifesto do ciclo PASSADO, não o novo.
    // Rotacionar depois deixaria as duas cópias idênticas e a recuperação sem para onde voltar.
    expect(lerDoDisco(fs, ANTERIOR)).toEqual(manifesto())
  })

  it('descarrega a fila do app antes de ler o cofre', async () => {
    const { deps, etapas } = montar({ local: { 'a.json': loc({ hash: 'H1' }) } })

    await executarCiclo(deps)

    expect(etapas.indexOf('descarregarFilas')).toBeLessThan(etapas.indexOf('varrerLocal'))
  })

  it('gravação pendente para o ciclo antes de ler o cofre e antes de falar com o Drive', async () => {
    const pendente: FalhaDeGravacao[] = [{ caminho: 'a.json', rotulo: 'Gandalf' }]
    const { fs, deps, chamadas, etapas } = montar({ descarga: pendente })

    const r = await executarCiclo(deps)

    expect(r).toEqual({ tipo: 'gravacaoPendente', falhas: pendente })
    expect(etapas).toEqual(['descarregarFilas'])
    expect(chamadas).toEqual([])
    // manifesto intocado: nada aconteceu, nada a registrar
    expect(lerDoDisco(fs, ATUAL)).toEqual(manifesto())
    expect(fs.arquivos.has(ANTERIOR)).toBe(false)
  })

  it('freio de deleção em massa: nenhuma ação executada e manifesto intocado', async () => {
    const arquivos: Record<string, EntradaArquivo> = {}
    const remotos: ItemRemoto[] = []
    for (let i = 0; i < 12; i += 1) {
      arquivos[`f${i}.json`] = ent({ fileId: `id${i}` })
      remotos.push(item({ caminho: `f${i}.json`, fileId: `id${i}` }))
    }
    // varredura local vazia: é a "pasta que não montou" contra a qual o freio existe
    const { fs, deps, chamadas } = montar({
      anterior: manifesto({ arquivos }),
      local: {},
      listagem: { arquivos: remotos },
    })

    const r = await executarCiclo(deps)

    expect(r).toEqual({ tipo: 'freio', apagaria: 12, total: 12 })
    expect(chamadas.some((c) => c.startsWith('apagar:'))).toBe(false)
    expect(lerDoDisco(fs, ATUAL)).toEqual(manifesto({ arquivos }))
    expect(fs.arquivos.has(ANTERIOR)).toBe(false)
  })

  it('arquivo sem sha256 no Drive cai na versão remota em vez de baixar para sempre', async () => {
    // `hash: null` é o Option<String> do Rust chegando como null. Tratado como "sem hash", o motor
    // compara `versaoRemota` e conclui igual; tratado como valor, concluiria "mudou" todo ciclo.
    const { deps, chamadas } = montar({ listagem: { arquivos: [item({ hash: null })] } })

    const r = await executarCiclo(deps)

    expect(r.tipo).toBe('sincronizado')
    expect(chamadas).toEqual(['listar:raizDrive'])
  })

  it('cofre sem manifesto é "não pareado" e não fala com o Drive', async () => {
    const { deps, chamadas, etapas } = montar({ anterior: null })

    expect(await executarCiclo(deps)).toEqual({ tipo: 'naoPareado' })
    expect(chamadas).toEqual([])
    expect(etapas).toEqual(['descarregarFilas'])
  })

  it('ação que falha grava o manifesto mas NÃO promove o backup', async () => {
    const { fs, deps, falhas } = montar({ local: { 'a.json': loc({ hash: 'H1' }) } })
    falhas.set('enviar:a.json', 'cota estourada')

    const r = await executarCiclo(deps)

    expect(r.tipo).toBe('sincronizado')
    if (r.tipo !== 'sincronizado') return
    expect(r.falhas).toEqual([{ acao: { tipo: 'subir', caminho: 'a.json' }, erro: 'cota estourada' }])
    // a entrada anterior sobrevive: é ela que faz o ciclo seguinte rederivar a divergência
    expect(r.manifesto.arquivos['a.json']).toEqual(ent())
    expect(lerDoDisco(fs, ATUAL)).toEqual(r.manifesto)
    expect(fs.arquivos.has(ANTERIOR)).toBe(false)
  })

  it('conflito entrega ao preservador o deviceNome que assina a cópia perdedora', async () => {
    const { deps, preservados, chamadas, etapas } = montar({
      local: { 'a.json': loc({ hash: 'H1' }) },
      listagem: { arquivos: [item({ hash: 'H2', deviceNome: 'PC Trabalho' })] },
    })

    await executarCiclo(deps)

    // a política é montada COM o manifesto do ciclo: é dele que sai o nome desta máquina, que
    // assina a cópia quando quem perde é o lado remoto
    expect(etapas).toContain('preservarPerdedor:PC Casa')
    expect(preservados).toHaveLength(1)
    expect(preservados[0].acao).toEqual({ tipo: 'conflito', caminho: 'a.json', vencedor: 'local' })
    expect(preservados[0].remoto?.deviceNome).toBe('PC Trabalho')
    // preservar vem ANTES do envio: depois da transferência não há mais perdedor para salvar
    expect(chamadas).toEqual(['listar:raizDrive', 'enviar:a.json'])
  })

  it('erro de rede na listagem sobe para quem orquestra', async () => {
    const { deps, falhas } = montar()
    falhas.set('listar:raizDrive', new Error('sem internet'))

    await expect(executarCiclo(deps)).rejects.toThrow('sem internet')
  })

  it('a pasta remota da listagem vira destino do upload, sem criar pasta de novo', async () => {
    const { deps, chamadas } = montar({
      anterior: manifesto({ arquivos: { 'campanhas/x.json': ent() } }),
      local: { 'campanhas/x.json': loc({ hash: 'H1' }) },
      listagem: {
        pastas: [{ caminho: 'campanhas', fileId: 'pastaCampanhas' }],
        arquivos: [item({ caminho: 'campanhas/x.json' })],
      },
    })

    await executarCiclo(deps)

    expect(chamadas).toEqual(['listar:raizDrive', 'enviar:x.json'])
  })
})

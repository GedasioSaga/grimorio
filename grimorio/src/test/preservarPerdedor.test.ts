import { describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import type { FsBridge } from '../lib/fsBridge'
import { AUTOR_DESCONHECIDO } from '../lib/sync/conflito'
import type { ClienteDrive, PedidoEnvio } from '../lib/sync/driveBridge'
import type { AcaoConflito } from '../lib/sync/executar'
import { criarPreservador, type DependenciasDePreservacao } from '../lib/sync/preservar'
import type { EstadoRemoto } from '../lib/sync/tipos'

const RAIZ = 'C:/Cofre/RPG'
const DEVICE = 'PC Casa'
const RAIZ_DRIVE = 'raizDrive'
/** Componentes locais: o carimbo sai 26-07 14h32 em qualquer fuso. */
const QUANDO = new Date(2026, 6, 26, 14, 32)
const MARCA = `(conflito — ${DEVICE} 26-07 14h32)`

function conflito(caminho: string, vencedor: 'local' | 'remoto'): AcaoConflito {
  return { tipo: 'conflito', caminho, vencedor }
}

function remoto(over: Partial<EstadoRemoto> = {}): EstadoRemoto {
  return { fileId: 'f-remoto', hash: 'HR', versao: 'v9', deviceNome: DEVICE, ...over }
}

/**
 * Cliente do Drive falso. `conteudo` é o corpo que `baixar` deposita no disco — é por ele que os
 * testes distinguem "a cópia veio do Drive" de "a cópia veio do disco local".
 */
function criarFakeDrive(fs: FsBridge) {
  const chamadas: string[] = []
  const enviados: PedidoEnvio[] = []
  const conteudo = new Map<string, string>()

  const drive: ClienteDrive = {
    pastaRaiz: () => Promise.reject(new Error('a preservação não procura a raiz')),
    garantirPasta: () => Promise.reject(new Error('a preservação não cria pasta no Drive')),
    listar: () => Promise.reject(new Error('a preservação não lista')),
    apagar: () => Promise.reject(new Error('a preservação nunca apaga nada')),
    async enviar(pedido) {
      chamadas.push(`enviar:${pedido.nome}`)
      enviados.push(pedido)
      return { fileId: pedido.fileId ?? 'novo', hash: null, versao: 'v10', tamanho: null }
    },
    async baixar(fileId, caminhoLocal) {
      chamadas.push(`baixar:${fileId}`)
      const texto = conteudo.get(fileId)
      if (texto === undefined) throw new Error(`o Drive não tem ${fileId}`)
      await fs.writeTextAtomic(caminhoLocal, texto)
    },
  }

  return { drive, chamadas, enviados, conteudo }
}

function montar() {
  const fs = criarFakeFs()
  const fake = criarFakeDrive(fs)
  let contador = 0

  // o FS falso materializa a pasta-mãe sozinho ao gravar, e o de verdade não: sem observar a
  // chamada, um `mkdirAll` esquecido passaria no teste e quebraria só no disco real
  const mkdirs: string[] = []
  const mkdirAll = fs.mkdirAll
  fs.mkdirAll = async (caminho) => {
    mkdirs.push(caminho)
    await mkdirAll(caminho)
  }

  const deps: DependenciasDePreservacao = {
    fs,
    drive: fake.drive,
    raizLocal: RAIZ,
    deviceNome: DEVICE,
    pastaRaizId: RAIZ_DRIVE,
    novoId: () => `id-novo-${++contador}`,
    agora: () => QUANDO,
  }

  const preservador = criarPreservador(deps)
  const ler = (rel: string) => fs.readText(`${RAIZ}/${rel}`)
  const escrever = (rel: string, texto: string) => fs.writeTextAtomic(`${RAIZ}/${rel}`, texto)
  const existe = (rel: string) => fs.arquivos.has(`${RAIZ}/${rel}`)
  return { fs, fake, deps, preservador, ler, escrever, existe, mkdirs }
}

const GANDALF = 'campanhas/aventura/personagens/gandalf.json'

function personagem(nome: string, resumo: string): string {
  return JSON.stringify({
    id: 'p-1', nome, versaoAtivaId: 'v1',
    versoes: [{ id: 'v1', nome, resumo }],
  })
}

describe('entidade', () => {
  it('vencedor local: baixa o perdedor REMOTO e grava a cópia com id novo', async () => {
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'daqui'))
    c.fake.conteudo.set('f-remoto', personagem('Gandalf', 'do Drive'))

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'local'), remoto())

    const copia = JSON.parse(await c.ler(`campanhas/aventura/personagens/gandalf ${MARCA}.json`))
    expect(copia.id).toBe('id-novo-1')
    expect(copia.nome).toBe('(conflito) Gandalf')
    // o corpo é o do Drive: é a versão remota que estava para ser sobrescrita pelo upload
    expect(copia.versoes[0].resumo).toBe('do Drive')
    // e o original no disco segue intacto — quem converge é o executor, não esta camada
    expect(JSON.parse(await c.ler(GANDALF)).versoes[0].resumo).toBe('daqui')
  })

  it('vencedor remoto: copia o perdedor LOCAL antes de o download passar por cima', async () => {
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'daqui'))

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'remoto'), remoto())

    // nada foi baixado: o perdedor é o arquivo que já está no disco
    expect(c.fake.chamadas).toEqual([])
    const copia = JSON.parse(await c.ler(`campanhas/aventura/personagens/gandalf ${MARCA}.json`))
    expect(copia.versoes[0].resumo).toBe('daqui')
    expect(copia.id).toBe('id-novo-1')
  })

  it('a forma ativa do personagem é prefixada junto com o nome de topo', async () => {
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'x'))

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'remoto'), remoto())

    const copia = JSON.parse(await c.ler(`campanhas/aventura/personagens/gandalf ${MARCA}.json`))
    expect(copia.versoes[0].nome).toBe('(conflito) Gandalf')
  })

  it('JSON ilegível é preservado tal e qual, byte por byte', async () => {
    const c = montar()
    await c.escrever(GANDALF, '{ truncado no meio')

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'remoto'), remoto())

    expect(await c.ler(`campanhas/aventura/personagens/gandalf ${MARCA}.json`)).toBe('{ truncado no meio')
    expect(c.preservador.resolvidos()[0].copia).toBe(`campanhas/aventura/personagens/gandalf ${MARCA}.json`)
  })

  it('cenário vira PASTA irmã, com o diretório criado', async () => {
    const c = montar()
    const cenario = 'cenarios/reino/cidade-alta/cenario.json'
    await c.escrever(cenario, JSON.stringify({ id: 'c-1', nome: 'Cidade Alta' }))

    await c.preservador.preservarPerdedor(conflito(cenario, 'remoto'), remoto())

    const copia = JSON.parse(await c.ler(`cenarios/reino/cidade-alta ${MARCA}/cenario.json`))
    expect(copia.nome).toBe('(conflito) Cidade Alta')
    expect(c.mkdirs).toEqual([`${RAIZ}/cenarios/reino/cidade-alta ${MARCA}`])
  })
})

describe('assinatura da cópia', () => {
  it('quando o local vence, a cópia leva o nome do computador que escreveu a versão remota', async () => {
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'daqui'))
    c.fake.conteudo.set('f-remoto', personagem('Gandalf', 'do Drive'))

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'local'), remoto({ deviceNome: 'Notebook' }))

    expect(c.existe(`campanhas/aventura/personagens/gandalf (conflito — Notebook 26-07 14h32).json`)).toBe(true)
  })

  it('remoto sem appProperties assina como desconhecido, não como este PC', async () => {
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'daqui'))
    c.fake.conteudo.set('f-remoto', personagem('Gandalf', 'do Drive'))

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'local'), remoto({ deviceNome: undefined }))

    expect(c.existe(`campanhas/aventura/personagens/gandalf (conflito — ${AUTOR_DESCONHECIDO} 26-07 14h32).json`))
      .toBe(true)
  })
})

describe('binário', () => {
  const RETRATO = 'campanhas/aventura/assets/retrato.png'

  it('a imagem perdedora é copiada sem alteração de conteúdo', async () => {
    const c = montar()
    await c.escrever(RETRATO, '<bin:local>')

    await c.preservador.preservarPerdedor(conflito(RETRATO, 'remoto'), remoto())

    expect(await c.ler(`campanhas/aventura/assets/retrato ${MARCA}.png`)).toBe('<bin:local>')
    expect(c.preservador.resolvidos()).toEqual([
      { caminho: RETRATO, copia: `campanhas/aventura/assets/retrato ${MARCA}.png`, politica: 'binario' },
    ])
  })

  it('imagem remota perdedora é baixada para a cópia', async () => {
    const c = montar()
    await c.escrever(RETRATO, '<bin:local>')
    c.fake.conteudo.set('f-remoto', '<bin:drive>')

    await c.preservador.preservarPerdedor(conflito(RETRATO, 'local'), remoto())

    expect(await c.ler(`campanhas/aventura/assets/retrato ${MARCA}.png`)).toBe('<bin:drive>')
  })
})

describe('metadado', () => {
  it('não gera cópia nem toca em disco ou rede — só registra', async () => {
    const c = montar()
    await c.escrever('campanhas/aventura/campanha.json', '{"id":"c","nome":"Aventura"}')

    await c.preservador.preservarPerdedor(conflito('campanhas/aventura/campanha.json', 'local'), remoto())

    expect(c.fake.chamadas).toEqual([])
    expect(c.fs.arquivos.size).toBe(1) // só o original que o teste escreveu
    expect(c.preservador.resolvidos()).toEqual([
      { caminho: 'campanhas/aventura/campanha.json', copia: null, politica: 'metadado' },
    ])
  })

  it('pasta.json e cofre.json seguem a mesma regra', async () => {
    const c = montar()

    await c.preservador.preservarPerdedor(conflito('personagens-soltos/viloes/pasta.json', 'remoto'), remoto())
    await c.preservador.preservarPerdedor(conflito('cofre.json', 'remoto'), remoto())

    expect(c.fs.arquivos.size).toBe(0)
    expect(c.preservador.resolvidos().map((r) => r.politica)).toEqual(['metadado', 'metadado'])
  })
})

/** `vinculos.json` como o cofre grava: `{ vinculos: [...] }`. */
function vinculos(...ids: string[]): string {
  return JSON.stringify({
    vinculos: ids.map((id) => ({
      id, deTipo: 'personagem', deId: `de-${id}`, paraTipo: 'cenario', paraId: 'c1',
      tipo: 'mora em', notas: '', criadoEm: '',
    })),
  })
}

describe('vinculos.json — união', () => {
  it('mescla os dois lados, grava local, sobe o mesclado e não deixa cópia', async () => {
    const c = montar()
    await c.escrever('vinculos.json', vinculos('daqui'))
    c.fake.conteudo.set('f-remoto', vinculos('de-la'))

    await c.preservador.preservarPerdedor(conflito('vinculos.json', 'local'), remoto())

    const unido = JSON.parse(await c.ler('vinculos.json'))
    expect(unido.vinculos.map((v: { id: string }) => v.id)).toEqual(['daqui', 'de-la'])
    // subir o mesclado é o que faz a união sobreviver quando o vencedor é o REMOTO: sem isso o
    // download seguinte do executor passaria por cima dos vínculos criados neste computador
    expect(c.fake.enviados).toEqual([{
      pastaId: RAIZ_DRIVE,
      nome: 'vinculos.json',
      caminhoLocal: `${RAIZ}/vinculos.json`,
      fileId: 'f-remoto',
      deviceNome: DEVICE,
    }])
    expect(c.preservador.resolvidos()).toEqual([{ caminho: 'vinculos.json', copia: null, politica: 'uniao' }])
    // índice não vira cópia de conflito: o temporário do download some
    expect(c.fs.arquivos.size).toBe(1)
  })

  it('a união vale com qualquer vencedor — o remoto vencer não descarta os vínculos daqui', async () => {
    const c = montar()
    await c.escrever('vinculos.json', vinculos('daqui'))
    c.fake.conteudo.set('f-remoto', vinculos('de-la'))

    await c.preservador.preservarPerdedor(conflito('vinculos.json', 'remoto'), remoto())

    expect(JSON.parse(await c.ler('vinculos.json')).vinculos).toHaveLength(2)
    expect(c.fake.enviados).toHaveLength(1)
  })

  it('vinculos.json local ausente não impede a união (o remoto vira a lista inteira)', async () => {
    const c = montar()
    c.fake.conteudo.set('f-remoto', vinculos('de-la'))

    await c.preservador.preservarPerdedor(conflito('vinculos.json', 'local'), remoto())

    expect(JSON.parse(await c.ler('vinculos.json')).vinculos.map((v: { id: string }) => v.id)).toEqual(['de-la'])
  })

  it('lado corrompido ABORTA em vez de mesclar com lista vazia', async () => {
    // tratar ilegível como "sem vínculo" apagaria as relações do outro lado em silêncio; abortar
    // deixa os dois arquivos intactos e a falha aparece em ResultadoCiclo.falhas
    const c = montar()
    await c.escrever('vinculos.json', vinculos('daqui'))
    c.fake.conteudo.set('f-remoto', '{ truncado')

    await expect(c.preservador.preservarPerdedor(conflito('vinculos.json', 'local'), remoto()))
      .rejects.toThrow('não é JSON válido')

    expect(await c.ler('vinculos.json')).toBe(vinculos('daqui'))
    expect(c.fake.enviados).toEqual([])
    expect(c.preservador.resolvidos()).toEqual([])
  })
})

describe('colisão de nome', () => {
  it('nome já ocupado no disco passa para a numeração', async () => {
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'daqui'))
    await c.escrever(`campanhas/aventura/personagens/gandalf ${MARCA}.json`, 'de um ciclo anterior')

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'remoto'), remoto())

    expect(await c.ler(`campanhas/aventura/personagens/gandalf ${MARCA}.json`)).toBe('de um ciclo anterior')
    expect(c.existe(`campanhas/aventura/personagens/gandalf ${MARCA} (2).json`)).toBe(true)
  })

  it('duas cópias sucessivas no mesmo minuto não se sobrescrevem', async () => {
    // caso real e documentado no executor: preservar dá certo, a transferência falha, e o ciclo
    // seguinte gera outra cópia do MESMO arquivo
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'primeira'))

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'remoto'), remoto())
    await c.escrever(GANDALF, personagem('Gandalf', 'segunda'))
    await c.preservador.preservarPerdedor(conflito(GANDALF, 'remoto'), remoto())

    const dir = 'campanhas/aventura/personagens'
    expect(JSON.parse(await c.ler(`${dir}/gandalf ${MARCA}.json`)).versoes[0].resumo).toBe('primeira')
    expect(JSON.parse(await c.ler(`${dir}/gandalf ${MARCA} (2).json`)).versoes[0].resumo).toBe('segunda')
    // e as duas são entidades distintas — mesmo id faria uma sumir da sidebar
    expect(JSON.parse(await c.ler(`${dir}/gandalf ${MARCA}.json`)).id).toBe('id-novo-1')
    expect(JSON.parse(await c.ler(`${dir}/gandalf ${MARCA} (2).json`)).id).toBe('id-novo-2')
  })

  it('sem nome livre a ação FALHA em vez de laçar para sempre', async () => {
    // `exists` mentindo "sim" para tudo é o que um diretório sem permissão de leitura faz. Sem
    // teto, o laço nunca sairia; com teto, a falha aparece em ResultadoCiclo.falhas e o executor
    // não converge — o perdedor continua inteiro nos dois lados.
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'daqui'))
    c.fs.exists = async () => true

    await expect(c.preservador.preservarPerdedor(conflito(GANDALF, 'remoto'), remoto()))
      .rejects.toThrow('não há nome livre')
  })

  it('a cópia de um cenário também numera em vez de reusar a pasta', async () => {
    const c = montar()
    const cenario = 'cenarios/cidade/cenario.json'
    await c.escrever(cenario, JSON.stringify({ id: 'c-1', nome: 'Cidade' }))

    await c.preservador.preservarPerdedor(conflito(cenario, 'remoto'), remoto())
    await c.preservador.preservarPerdedor(conflito(cenario, 'remoto'), remoto())

    expect(c.existe(`cenarios/cidade ${MARCA}/cenario.json`)).toBe(true)
    expect(c.existe(`cenarios/cidade ${MARCA} (2)/cenario.json`)).toBe(true)
  })
})

describe('remoto que sumiu entre o plano e a execução', () => {
  it('perdedor remoto que já não existe: nada a preservar, e o local fica intacto', async () => {
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'daqui'))

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'local'), remoto({ removido: true }))

    expect(c.fake.chamadas).toEqual([])
    expect(c.fs.arquivos.size).toBe(1)
    expect(c.preservador.resolvidos()).toEqual([{ caminho: GANDALF, copia: null, politica: 'entidade' }])
  })

  it('vencedor remoto sem remoto vivo LANÇA — o executor não pode baixar de uma lápide', async () => {
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'daqui'))

    await expect(c.preservador.preservarPerdedor(conflito(GANDALF, 'remoto'), undefined))
      .rejects.toThrow('não está mais no Google Drive')
  })

  it('união sem remoto vivo LANÇA: não há com o que mesclar', async () => {
    const c = montar()
    await c.escrever('vinculos.json', vinculos('daqui'))

    await expect(c.preservador.preservarPerdedor(conflito('vinculos.json', 'local'), remoto({ removido: true })))
      .rejects.toThrow('não está mais no Google Drive')
  })
})

describe('resolvidos', () => {
  it('acumula na ordem e não deixa o chamador mexer na lista interna', async () => {
    const c = montar()
    await c.escrever(GANDALF, personagem('Gandalf', 'x'))
    await c.escrever('campanhas/aventura/assets/retrato.png', '<bin>')

    await c.preservador.preservarPerdedor(conflito(GANDALF, 'remoto'), remoto())
    await c.preservador.preservarPerdedor(conflito('campanhas/aventura/assets/retrato.png', 'remoto'), remoto())

    const lista = c.preservador.resolvidos()
    expect(lista.map((r) => r.politica)).toEqual(['entidade', 'binario'])
    lista.pop()
    expect(c.preservador.resolvidos()).toHaveLength(2)
  })
})

import { describe, expect, it } from 'vitest'
import { criarFakeFs } from './fakeFs'
import type { FsBridge } from '../lib/fsBridge'
import { caminhoAbsoluto, executarPlano, type DependenciasDoCiclo, type EstadoDoCiclo } from '../lib/sync/executar'
import type { ClienteDrive, PedidoEnvio } from '../lib/sync/driveBridge'
import type { Acao, EntradaArquivo, EstadoLocal, EstadoRemoto, Manifesto } from '../lib/sync/tipos'

const RAIZ = 'C:/Cofre/RPG'
const AGORA = '2026-07-27T10:00:00.000Z'
const A = 'a.json'
/** Instante base da sonda; cada leitura devolve um mtime maior, como o disco faria. */
const RELOGIO_DA_SONDA = 5000

function ent(over: Partial<EntradaArquivo> = {}): EntradaArquivo {
  return { fileId: 'f-velho', hash: 'H0', tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v0', ...over }
}

function loc(over: Partial<EstadoLocal> = {}): EstadoLocal {
  return { hash: 'HL', tamanho: 10, mtime: 1000, ...over }
}

function rem(over: Partial<EstadoRemoto> = {}): EstadoRemoto {
  return { fileId: 'f-vivo', hash: 'HR', versao: 'v9', ...over }
}

function manifesto(over: Partial<Manifesto> = {}): Manifesto {
  return {
    versao: 1,
    cofreId: 'cofre-1',
    pastaRaizId: 'raizDrive',
    startPageToken: '900',
    deviceId: 'dev-1',
    deviceNome: 'PC Casa',
    ultimoSync: '2026-07-26T10:00:00.000Z',
    pastas: {},
    arquivos: {},
    ...over,
  }
}

/** O que o download de `fileId` entrega. Determinístico, para o hash pós-download ser exato. */
function conteudoDe(fileId: string): string {
  return `conteúdo de ${fileId}`
}

/** Mesma convenção de `criarSondador`: hash do conteúdo REAL do fake fs, para o snapshot bater. */
function shaDe(conteudo: string): string {
  return `sha(${conteudo})`
}

/**
 * Cliente do Drive falso.
 *
 * `falhas` mapeia a assinatura da chamada (`'enviar:a.json'`) para o que ela deve lançar —
 * inclusive uma string crua, que é como o `invoke` do Tauri rejeita quando o `Result::Err` do
 * Rust vem com mensagem.
 *
 * `garantirPasta` devolve um id que embute a cadeia inteira (`id(id(raizDrive/x)/y)`), o que
 * torna visível no assert se a descida foi feita segmento a segmento ou de uma vez só.
 */
function criarFakeDrive(fs: FsBridge) {
  const chamadas: string[] = []
  const falhas = new Map<string, unknown>()
  const enviados: PedidoEnvio[] = []
  const apagados: string[] = []
  let versao = 0

  function registrar(operacao: string, alvo: string): void {
    const assinatura = `${operacao}:${alvo}`
    chamadas.push(assinatura)
    if (falhas.has(assinatura)) throw falhas.get(assinatura)
  }

  const drive: ClienteDrive = {
    async pastaRaiz() {
      registrar('pastaRaiz', '')
      return 'raizDrive'
    },
    async garantirPasta(pastaMaeId, caminho) {
      registrar('garantirPasta', `${pastaMaeId}/${caminho}`)
      return `id(${pastaMaeId}/${caminho})`
    },
    async listar() {
      throw new Error('o executor não lista — a listagem chega pronta em EstadoDoCiclo')
    },
    async enviar(pedido) {
      registrar('enviar', pedido.nome)
      enviados.push(pedido)
      versao += 1
      // `hash: null` de propósito: o Drive nem sempre soma o sha256, e o manifesto não pode
      // depender disso para o lado local.
      return { fileId: pedido.fileId ?? `novo(${pedido.nome})`, hash: null, versao: `v${versao}`, tamanho: null }
    },
    async baixar(fileId, caminhoLocal) {
      registrar('baixar', fileId)
      await fs.writeTextAtomic(caminhoLocal, conteudoDe(fileId))
    },
    async apagar(fileId) {
      registrar('apagar', fileId)
      apagados.push(fileId)
    },
  }

  return { drive, chamadas, falhas, enviados, apagados }
}

/** Sonda o disco de mentira: hash derivado do conteúdo, mtime crescente. */
function criarSondador(fs: FsBridge) {
  let relogio = RELOGIO_DA_SONDA
  return async (caminho: string): Promise<EstadoLocal> => {
    const conteudo = await fs.readText(caminho)
    relogio += 1
    return { hash: `sha(${conteudo})`, tamanho: conteudo.length, mtime: relogio }
  }
}

interface Cenario {
  anterior?: Manifesto
  local?: Record<string, EstadoLocal>
  remoto?: Record<string, EstadoRemoto>
  pastasRemotas?: Record<string, string>
}

function montar(cenario: Cenario = {}) {
  const fs = criarFakeFs()
  const fake = criarFakeDrive(fs)
  const conflitos = { preservados: [] as string[], erro: null as unknown }

  const deps: DependenciasDoCiclo = {
    drive: fake.drive,
    fs,
    sondarLocal: criarSondador(fs),
    async preservarPerdedor(acao) {
      // entra em `chamadas` junto com as do Drive para que a ORDEM possa ser afirmada
      fake.chamadas.push(`preservar:${acao.caminho}`)
      conflitos.preservados.push(acao.caminho)
      if (conflitos.erro !== null) throw conflitos.erro
    },
    agora: () => AGORA,
  }

  const estado: EstadoDoCiclo = {
    anterior: cenario.anterior ?? manifesto(),
    local: new Map(Object.entries(cenario.local ?? {})),
    remoto: new Map(Object.entries(cenario.remoto ?? {})),
    pastasRemotas: new Map(Object.entries(cenario.pastasRemotas ?? {})),
    raizLocal: RAIZ,
  }

  const executar = (acoes: Acao[]) => executarPlano(acoes, estado, deps)
  return { fs, fake, deps, estado, conflitos, executar }
}

describe('plano vazio', () => {
  it('não toca em rede nem disco, e só o relógio do manifesto anda', async () => {
    const anterior = manifesto({ arquivos: { [A]: ent() }, pastas: { velha: 'p-velha' } })
    const { fake, fs, executar } = montar({
      anterior,
      local: { [A]: loc({ hash: 'H0' }) },
      remoto: { [A]: rem({ fileId: 'f-velho', versao: 'v0' }) },
      pastasRemotas: { campanhas: 'p1' },
    })

    const resultado = await executar([])

    expect(fake.chamadas).toEqual([])
    expect(fs.arquivos.size).toBe(0)
    expect(resultado.falhas).toEqual([])
    expect(resultado.concluidas).toEqual([])
    expect(resultado.manifesto).toEqual({
      ...anterior,
      ultimoSync: AGORA,
      pastas: { campanhas: 'p1' },
    })
  })
})

describe('subir', () => {
  it('cria no Drive quando não há remoto, e grava o hash LOCAL', async () => {
    const { fake, executar } = montar({ local: { 'campanhas/aventura/gandalf.json': loc() } })

    const resultado = await executar([{ tipo: 'subir', caminho: 'campanhas/aventura/gandalf.json' }])

    expect(fake.enviados).toEqual([{
      pastaId: 'id(id(raizDrive/campanhas)/aventura)',
      nome: 'gandalf.json',
      caminhoLocal: `${RAIZ}/campanhas/aventura/gandalf.json`,
      fileId: null,
      deviceNome: 'PC Casa',
    }])
    // O hash é o da varredura local (`HL`) e não o do Drive (que veio `null`): o lado local do
    // motor não tem plano B, e um hash errado aqui reenviaria o cofre inteiro a cada ciclo.
    expect(resultado.manifesto.arquivos).toEqual({
      'campanhas/aventura/gandalf.json': {
        fileId: 'novo(gandalf.json)', hash: 'HL', tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v1',
      },
    })
  })

  it('substitui o arquivo que já existe, reusando o fileId vivo', async () => {
    const { fake, executar } = montar({ local: { [A]: loc() }, remoto: { [A]: rem() } })

    const resultado = await executar([{ tipo: 'subir', caminho: A }])

    expect(fake.enviados[0]?.fileId).toBe('f-vivo')
    expect(resultado.manifesto.arquivos[A]?.fileId).toBe('f-vivo')
  })

  it('com lápide remota CRIA de novo em vez de dar PATCH no arquivo da lixeira', async () => {
    // É o caso `mudou × apagado` da matriz. Reusar o id faria um PATCH num arquivo que está na
    // lixeira do Drive: responde 200, o upload "dá certo", e o arquivo continua invisível para
    // a listagem seguinte — o ciclo mandaria subir de novo, para sempre.
    const { fake, executar } = montar({
      local: { [A]: loc() },
      remoto: { [A]: rem({ fileId: 'f-na-lixeira', removido: true }) },
    })

    await executar([{ tipo: 'subir', caminho: A }])

    expect(fake.enviados[0]?.fileId).toBeNull()
  })

  it('arquivo na raiz do cofre vai direto para pastaRaizId, sem criar pasta', async () => {
    const { fake, executar } = montar({ local: { 'cofre.json': loc() } })

    await executar([{ tipo: 'subir', caminho: 'cofre.json' }])

    expect(fake.chamadas).toEqual(['enviar:cofre.json'])
    expect(fake.enviados[0]?.pastaId).toBe('raizDrive')
  })

  it('sem estado local a ação falha em vez de enviar um caminho que não existe', async () => {
    const { fake, executar } = montar()

    const resultado = await executar([{ tipo: 'subir', caminho: A }])

    expect(fake.enviados).toEqual([])
    expect(resultado.falhas[0]?.erro).toContain('varredura local')
  })
})

describe('baixar', () => {
  it('escreve o arquivo e registra o que ficou no DISCO, não o que o Drive prometeu', async () => {
    const { fs, executar } = montar({ remoto: { [A]: rem({ fileId: 'f1', hash: 'HR', versao: 'v9' }) } })

    const resultado = await executar([{ tipo: 'baixar', caminho: A }])

    const conteudo = conteudoDe('f1')
    expect(await fs.readText(`${RAIZ}/${A}`)).toBe(conteudo)
    // `hash` vem da sonda, e não do `HR` que a listagem trazia. O mtime também é do disco: sem
    // reler, a varredura seguinte veria "local mudou" e baixaria tudo outra vez.
    expect(resultado.manifesto.arquivos[A]).toEqual({
      fileId: 'f1',
      hash: `sha(${conteudo})`,
      tamanho: conteudo.length,
      mtimeLocal: RELOGIO_DA_SONDA + 1,
      versaoRemota: 'v9',
    })
  })

  it('lápide remota não é baixável: falha em vez de pedir um id morto', async () => {
    const { fake, executar } = montar({ remoto: { [A]: rem({ removido: true }) } })

    const resultado = await executar([{ tipo: 'baixar', caminho: A }])

    expect(fake.chamadas).toEqual([])
    expect(resultado.falhas[0]?.erro).toContain('Google Drive')
  })
})

describe('apagarLocal e apagarRemoto', () => {
  it('apagarLocal tira do disco e o caminho some do manifesto', async () => {
    const conteudo = 'conteúdo antigo'
    const { fs, fake, executar } = montar({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc({ hash: shaDe(conteudo) }) },
    })
    await fs.writeTextAtomic(`${RAIZ}/${A}`, conteudo)

    const resultado = await executar([{ tipo: 'apagarLocal', caminho: A }])

    expect(fs.arquivos.has(`${RAIZ}/${A}`)).toBe(false)
    expect(fake.chamadas).toEqual([])
    expect(resultado.manifesto.arquivos).toEqual({})
  })

  it('apagarRemoto manda para a lixeira do Drive e o caminho some do manifesto', async () => {
    const { fake, executar } = montar({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      remoto: { [A]: rem({ fileId: 'f1' }) },
    })

    const resultado = await executar([{ tipo: 'apagarRemoto', caminho: A }])

    expect(fake.apagados).toEqual(['f1'])
    expect(resultado.manifesto.arquivos).toEqual({})
  })
})

describe('arquivo local mudou durante o ciclo', () => {
  const SNAPSHOT = 'estado que a varredura viu no início do ciclo'
  const EDICAO_DURANTE_O_CICLO = 'edição feita pelo usuário enquanto o ciclo rodava'

  it('baixar não sobrescreve o arquivo divergente: vira falha', async () => {
    const { fs, executar } = montar({
      local: { [A]: loc({ hash: shaDe(SNAPSHOT) }) },
      remoto: { [A]: rem({ fileId: 'f1' }) },
    })
    await fs.writeTextAtomic(`${RAIZ}/${A}`, EDICAO_DURANTE_O_CICLO)

    const resultado = await executar([{ tipo: 'baixar', caminho: A }])

    expect(await fs.readText(`${RAIZ}/${A}`)).toBe(EDICAO_DURANTE_O_CICLO)
    expect(resultado.falhas[0]?.erro).toContain('mudou no disco durante o ciclo')
    expect(resultado.manifesto.arquivos[A]).toBeUndefined()
  })

  it('apagarLocal não apaga o arquivo divergente: vira falha', async () => {
    const { fs, executar } = montar({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc({ hash: shaDe(SNAPSHOT) }) },
    })
    await fs.writeTextAtomic(`${RAIZ}/${A}`, EDICAO_DURANTE_O_CICLO)

    const resultado = await executar([{ tipo: 'apagarLocal', caminho: A }])

    expect(await fs.readText(`${RAIZ}/${A}`)).toBe(EDICAO_DURANTE_O_CICLO)
    expect(resultado.falhas[0]?.erro).toContain('mudou no disco durante o ciclo')
    // a entrada anterior sobrevive: o próximo ciclo vê local mudou × remoto apagado e refaz a conta
    expect(resultado.manifesto.arquivos[A]).toEqual(ent())
  })

  it('baixar com arquivo intacto no disco segue normal', async () => {
    const { fs, executar } = montar({
      local: { [A]: loc({ hash: shaDe(SNAPSHOT) }) },
      remoto: { [A]: rem({ fileId: 'f1' }) },
    })
    await fs.writeTextAtomic(`${RAIZ}/${A}`, SNAPSHOT)

    const resultado = await executar([{ tipo: 'baixar', caminho: A }])

    expect(resultado.falhas).toEqual([])
    expect(await fs.readText(`${RAIZ}/${A}`)).toBe(conteudoDe('f1'))
  })

  it('subir não envia o arquivo divergente: vira falha', async () => {
    // Sem a guarda, o envio sobe os bytes NOVOS do disco com o hash VELHO da varredura no
    // manifesto. O ciclo seguinte lê "local mudou × remoto mudou" num arquivo que ninguém
    // editou em outra máquina e fabrica uma cópia de conflito — a cada ciclo, enquanto o
    // usuário estiver editando (o autosave do canvas grava fora de `descarregarFilas`).
    const { fs, fake, executar } = montar({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc({ hash: shaDe(SNAPSHOT) }) },
      remoto: { [A]: rem() },
    })
    await fs.writeTextAtomic(`${RAIZ}/${A}`, EDICAO_DURANTE_O_CICLO)

    const resultado = await executar([{ tipo: 'subir', caminho: A }])

    expect(fake.enviados).toEqual([])
    expect(resultado.falhas[0]?.erro).toContain('mudou no disco durante o ciclo')
    // a entrada anterior sobrevive: o próximo ciclo varre de novo e sobe o conteúdo assentado
    expect(resultado.manifesto.arquivos[A]).toEqual(ent())
  })

  it('subir com arquivo intacto no disco segue normal', async () => {
    const { fs, fake, executar } = montar({ local: { [A]: loc({ hash: shaDe(SNAPSHOT) }) } })
    await fs.writeTextAtomic(`${RAIZ}/${A}`, SNAPSHOT)

    const resultado = await executar([{ tipo: 'subir', caminho: A }])

    expect(resultado.falhas).toEqual([])
    expect(fake.enviados).toHaveLength(1)
  })

  it('conflito com arquivo divergente adia ANTES de preservar: nenhuma cópia nasce', async () => {
    // A ordem importa: preservar primeiro e desistir na transferência deixava o conflito de
    // pé E uma cópia nova no cofre a cada ciclo — a fileira de "(conflito) …" na sidebar.
    const { fs, fake, conflitos, executar } = montar({
      local: { [A]: loc({ hash: shaDe(SNAPSHOT) }) },
      remoto: { [A]: rem() },
    })
    await fs.writeTextAtomic(`${RAIZ}/${A}`, EDICAO_DURANTE_O_CICLO)

    const resultado = await executar([{ tipo: 'conflito', caminho: A, vencedor: 'local' }])

    expect(conflitos.preservados).toEqual([])
    expect(fake.chamadas).toEqual([])
    expect(resultado.falhas[0]?.erro).toContain('mudou no disco durante o ciclo')
  })
})

describe('registrar', () => {
  it('não transfere nada e ainda assim grava a entrada', async () => {
    const { fake, fs, executar } = montar({
      local: { [A]: loc({ hash: 'HX' }) },
      remoto: { [A]: rem({ fileId: 'f1', hash: 'HX', versao: 'v3' }) },
    })

    const resultado = await executar([{ tipo: 'registrar', caminho: A }])

    expect(fake.chamadas).toEqual([])
    expect(fs.arquivos.size).toBe(0)
    expect(resultado.manifesto.arquivos[A]).toEqual({
      fileId: 'f1', hash: 'HX', tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v3',
    })
  })
})

describe('conflito', () => {
  it('vencedor local: preserva o perdedor ANTES de subir', async () => {
    const { fake, conflitos, executar } = montar({ local: { [A]: loc() }, remoto: { [A]: rem() } })

    const resultado = await executar([{ tipo: 'conflito', caminho: A, vencedor: 'local' }])

    expect(fake.chamadas).toEqual([`preservar:${A}`, `enviar:${A}`])
    expect(conflitos.preservados).toEqual([A])
    expect(resultado.manifesto.arquivos[A]?.hash).toBe('HL')
  })

  it('vencedor remoto: preserva o perdedor ANTES de baixar', async () => {
    const { fake, executar } = montar({ local: { [A]: loc() }, remoto: { [A]: rem({ fileId: 'f1' }) } })

    const resultado = await executar([{ tipo: 'conflito', caminho: A, vencedor: 'remoto' }])

    expect(fake.chamadas).toEqual([`preservar:${A}`, 'baixar:f1'])
    expect(resultado.manifesto.arquivos[A]?.hash).toBe(`sha(${conteudoDe('f1')})`)
  })

  it('preservação que falha ABORTA a transferência — o perdedor não pode ser destruído', async () => {
    const { fake, conflitos, executar } = montar({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc() },
      remoto: { [A]: rem() },
    })
    conflitos.erro = new Error('a pasta de cópias está bloqueada')

    const resultado = await executar([{ tipo: 'conflito', caminho: A, vencedor: 'local' }])

    expect(fake.chamadas).toEqual([`preservar:${A}`])
    expect(resultado.falhas[0]?.erro).toBe('a pasta de cópias está bloqueada')
    expect(resultado.manifesto.arquivos[A]).toEqual(ent())
  })
})

describe('cadeia de pastas', () => {
  it('desce um segmento por vez e reaproveita o prefixo entre arquivos da mesma pasta', async () => {
    const { fake, executar } = montar({
      local: { 'campanhas/aventura/x.json': loc(), 'campanhas/aventura/y.json': loc() },
    })

    await executar([
      { tipo: 'subir', caminho: 'campanhas/aventura/x.json' },
      { tipo: 'subir', caminho: 'campanhas/aventura/y.json' },
    ])

    // duas pastas resolvidas UMA vez cada, não uma resolução por arquivo
    expect(fake.chamadas).toEqual([
      'garantirPasta:raizDrive/campanhas',
      'garantirPasta:id(raizDrive/campanhas)/aventura',
      'enviar:x.json',
      'enviar:y.json',
    ])
  })

  it('pasta que a listagem já trouxe não é resolvida de novo', async () => {
    const { fake, executar } = montar({
      local: { 'campanhas/aventura/x.json': loc() },
      pastasRemotas: { campanhas: 'p1', 'campanhas/aventura': 'p2' },
    })

    await executar([{ tipo: 'subir', caminho: 'campanhas/aventura/x.json' }])

    expect(fake.chamadas).toEqual(['enviar:x.json'])
    expect(fake.enviados[0]?.pastaId).toBe('p2')
  })

  it('as pastas criadas no ciclo entram no manifesto junto com as listadas', async () => {
    const { executar } = montar({
      local: { 'cenarios/floresta.json': loc() },
      pastasRemotas: { campanhas: 'p1' },
    })

    const resultado = await executar([{ tipo: 'subir', caminho: 'cenarios/floresta.json' }])

    expect(resultado.manifesto.pastas).toEqual({ campanhas: 'p1', cenarios: 'id(raizDrive/cenarios)' })
  })
})

describe('uma falha não derruba o ciclo', () => {
  const TRES: Acao[] = [
    { tipo: 'subir', caminho: 'a.json' },
    { tipo: 'subir', caminho: 'b.json' },
    { tipo: 'subir', caminho: 'c.json' },
  ]

  function tresArquivos() {
    return montar({
      anterior: manifesto({ arquivos: { 'b.json': ent({ fileId: 'f-b' }) } }),
      local: { 'a.json': loc(), 'b.json': loc(), 'c.json': loc() },
    })
  }

  it('as outras ações seguem, e o resultado separa o que deu certo do que não deu', async () => {
    const cenario = tresArquivos()
    cenario.fake.falhas.set('enviar:b.json', new Error('o arquivo está aberto em outro programa'))

    const resultado = await cenario.executar(TRES)

    expect(resultado.concluidas).toEqual([TRES[0], TRES[2]])
    expect(resultado.falhas).toEqual([
      { acao: TRES[1], erro: 'o arquivo está aberto em outro programa' },
    ])
    expect(Object.keys(resultado.manifesto.arquivos)).toEqual(['a.json', 'b.json', 'c.json'])
  })

  it('o caminho que falhou mantém a entrada do último sync bem-sucedido', async () => {
    const cenario = tresArquivos()
    cenario.fake.falhas.set('enviar:b.json', new Error('travado'))

    const resultado = await cenario.executar(TRES)

    // Se a entrada virasse a que o upload TERIA produzido, o ciclo seguinte concluiria
    // "igual × igual" e este arquivo ficaria dessincronizado para sempre, em silêncio.
    expect(resultado.manifesto.arquivos['b.json']).toEqual(ent({ fileId: 'f-b' }))
    expect(resultado.manifesto.arquivos['a.json']?.fileId).toBe('novo(a.json)')
  })

  it('caminho novo que falhou fica de fora do manifesto', async () => {
    const cenario = montar({ local: { [A]: loc() } })
    cenario.fake.falhas.set(`enviar:${A}`, new Error('travado'))

    const resultado = await cenario.executar([{ tipo: 'subir', caminho: A }])

    expect(resultado.manifesto.arquivos).toEqual({})
  })

  it('erro que chega como string crua — o jeito do Tauri — vira mensagem legível', async () => {
    // `invoke` rejeita com a String do `Result::Err`, não com um `Error`: ler `.message`
    // devolveria `undefined` em toda falha vinda do Drive.
    const cenario = montar({ local: { [A]: loc() } })
    cenario.fake.falhas.set(`enviar:${A}`, 'a sessão com o Google expirou (HTTP 401)')

    const resultado = await cenario.executar([{ tipo: 'subir', caminho: A }])

    expect(resultado.falhas[0]?.erro).toBe('a sessão com o Google expirou (HTTP 401)')
  })

  it('pasta que não pôde ser criada derruba só quem ia para dentro dela, numa chamada só', async () => {
    const cenario = montar({
      local: {
        'campanhas/x.json': loc(),
        'campanhas/y.json': loc(),
        'solto.json': loc(),
      },
    })
    cenario.fake.falhas.set('garantirPasta:raizDrive/campanhas', 'o Google recusou a operação (HTTP 403)')

    const resultado = await cenario.executar([
      { tipo: 'subir', caminho: 'campanhas/x.json' },
      { tipo: 'subir', caminho: 'campanhas/y.json' },
      { tipo: 'subir', caminho: 'solto.json' },
    ])

    // uma tentativa de pasta, não uma por arquivo condenado
    expect(cenario.fake.chamadas).toEqual(['garantirPasta:raizDrive/campanhas', 'enviar:solto.json'])
    expect(resultado.falhas.map((f) => f.acao.caminho)).toEqual(['campanhas/x.json', 'campanhas/y.json'])
    expect(Object.keys(resultado.manifesto.arquivos)).toEqual(['solto.json'])
  })
})

describe('caminhoAbsoluto', () => {
  it('junta a raiz com o caminho relativo canônico', () => {
    expect(caminhoAbsoluto('C:/Cofre/RPG', 'campanhas/x.json')).toBe('C:/Cofre/RPG/campanhas/x.json')
  })

  it('aceita raiz com barra invertida e com barra final', () => {
    expect(caminhoAbsoluto('C:\\Cofre\\RPG\\', 'x.json')).toBe('C:/Cofre/RPG/x.json')
  })
})

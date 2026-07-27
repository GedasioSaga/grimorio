import { describe, expect, it } from 'vitest'
import { reconciliar } from '../lib/sync/reconciliar'
import type { Acao, EntradaArquivo, EstadoLocal, EstadoRemoto, Manifesto, Plano } from '../lib/sync/tipos'

const HASH_MANIFESTO = 'H0'
const HASH_LOCAL_NOVO = 'HL'
const HASH_REMOTO_NOVO = 'HR'

function entrada(over: Partial<EntradaArquivo> = {}): EntradaArquivo {
  return { fileId: 'f1', hash: HASH_MANIFESTO, tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v0', ...over }
}

function manifestoCom(arquivos: Record<string, EntradaArquivo>): Manifesto {
  return {
    versao: 1,
    cofreId: 'cofre1',
    pastaRaizId: 'raiz1',
    startPageToken: 'tok0',
    deviceId: 'dev1',
    deviceNome: 'PC Casa',
    ultimoSync: '2026-07-26T12:00:00Z',
    pastas: {},
    arquivos,
  }
}

function loc(over: Partial<EstadoLocal> = {}): EstadoLocal {
  return { hash: HASH_MANIFESTO, tamanho: 10, mtime: 1000, ...over }
}

function rem(over: Partial<EstadoRemoto> = {}): EstadoRemoto {
  return { fileId: 'f1', hash: HASH_MANIFESTO, versao: 'v0', ...over }
}

/** Caminhos `f00.json`…, com dois dígitos para que a ordem alfabética siga a numérica. */
function caminhos(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `f${String(i).padStart(2, '0')}.json`)
}

function entradasDe(cs: string[]): Record<string, EntradaArquivo> {
  return Object.fromEntries(cs.map((c) => [c, entrada()]))
}

function locaisDe(cs: string[]): Record<string, EstadoLocal> {
  return Object.fromEntries(cs.map((c) => [c, loc()]))
}

function remotosDe(cs: string[]): Record<string, EstadoRemoto> {
  return Object.fromEntries(cs.map((c) => [c, rem()]))
}

/** Roda o motor a partir de objetos simples — os Maps só existem na assinatura. */
function planejar(
  arquivos: Record<string, EntradaArquivo>,
  locais: Record<string, EstadoLocal>,
  remotos: Record<string, EstadoRemoto>,
): Plano {
  return reconciliar(manifestoCom(arquivos), new Map(Object.entries(locais)), new Map(Object.entries(remotos)))
}

/** Ações de um plano que precisava ter sido aceito. */
function acoesDe(plano: Plano): Acao[] {
  if (!plano.ok) throw new Error(`plano recusado: ${plano.motivo}`)
  return plano.acoes
}

/** Cenário de deleção: `total` conhecidos e presentes no remoto, só `sobram` presentes no local. */
function planoQueApaga(total: number, sobram: number): Plano {
  const todos = caminhos(total)
  return planejar(entradasDe(todos), locaisDe(todos.slice(0, sobram)), remotosDe(todos))
}

const A = 'a.json'
const CONHECIDO = { [A]: entrada() }
const LOCAL_IGUAL = { [A]: loc() }
const LOCAL_MUDOU = { [A]: loc({ hash: HASH_LOCAL_NOVO }) }
const LOCAL_APAGADO: Record<string, EstadoLocal> = {}
const REMOTO_IGUAL = { [A]: rem() }
const REMOTO_MUDOU = { [A]: rem({ hash: HASH_REMOTO_NOVO, versao: 'v1' }) }
const REMOTO_APAGADO = { [A]: rem({ removido: true }) }
const REMOTO_FORA_DO_MAPA: Record<string, EstadoRemoto> = {}

describe('matriz A — arquivo COM entrada no manifesto', () => {
  it('igual × igual → nenhuma ação', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_IGUAL, REMOTO_IGUAL))).toEqual([])
  })

  it('igual × mudou → baixar', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_IGUAL, REMOTO_MUDOU))).toEqual([{ tipo: 'baixar', caminho: A }])
  })

  it('igual × apagado → apagarLocal', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_IGUAL, REMOTO_APAGADO))).toEqual([{ tipo: 'apagarLocal', caminho: A }])
  })

  it('mudou × igual → subir', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_MUDOU, REMOTO_IGUAL))).toEqual([{ tipo: 'subir', caminho: A }])
  })

  it('mudou × mudou → conflito com vencedor local', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_MUDOU, REMOTO_MUDOU)))
      .toEqual([{ tipo: 'conflito', caminho: A, vencedor: 'local' }])
  })

  it('mudou × apagado → subir, porque edição vence deleção', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_MUDOU, REMOTO_APAGADO))).toEqual([{ tipo: 'subir', caminho: A }])
  })

  it('apagado × igual → apagarRemoto', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_APAGADO, REMOTO_IGUAL))).toEqual([{ tipo: 'apagarRemoto', caminho: A }])
  })

  it('apagado × mudou → baixar, porque edição vence deleção', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_APAGADO, REMOTO_MUDOU))).toEqual([{ tipo: 'baixar', caminho: A }])
  })

  it('apagado × apagado → nenhuma ação', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_APAGADO, REMOTO_APAGADO))).toEqual([])
  })
})

describe('matriz A — convergência não é conflito', () => {
  const HASH_CONVERGIDO = 'HC'

  it('os dois lados mudaram para o MESMO conteúdo → registrar, sem cópia de conflito', () => {
    const plano = planejar(
      CONHECIDO,
      { [A]: loc({ hash: HASH_CONVERGIDO }) },
      { [A]: rem({ hash: HASH_CONVERGIDO, versao: 'v1' }) },
    )
    expect(acoesDe(plano)).toEqual([{ tipo: 'registrar', caminho: A }])
  })

  it('sem hash remoto não há prova de convergência: continua conflito', () => {
    const plano = planejar(CONHECIDO, LOCAL_MUDOU, { [A]: rem({ hash: undefined, versao: 'v1' }) })
    expect(acoesDe(plano)).toEqual([{ tipo: 'conflito', caminho: A, vencedor: 'local' }])
  })
})

describe('matriz A — derivação de estado contra o manifesto', () => {
  it('remoto ausente do mapa vale o mesmo que removido: true', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_IGUAL, REMOTO_FORA_DO_MAPA)))
      .toEqual([{ tipo: 'apagarLocal', caminho: A }])
  })

  it('remoto sem hash decide por versaoRemota, e não assume "mudou"', () => {
    const mesmaVersao = { [A]: rem({ hash: undefined, versao: 'v0' }) }
    const outraVersao = { [A]: rem({ hash: undefined, versao: 'v9' }) }
    expect(acoesDe(planejar(CONHECIDO, LOCAL_IGUAL, mesmaVersao))).toEqual([])
    expect(acoesDe(planejar(CONHECIDO, LOCAL_IGUAL, outraVersao))).toEqual([{ tipo: 'baixar', caminho: A }])
  })

  it('regressão: arquivo apagado local não ressuscita no ciclo seguinte', () => {
    // Ciclo 1: só o local apagou; o remoto continua idêntico ao manifesto.
    expect(acoesDe(planejar(CONHECIDO, LOCAL_APAGADO, REMOTO_IGUAL)))
      .toEqual([{ tipo: 'apagarRemoto', caminho: A }])
    // Ciclo 2, manifesto já atualizado pelo executor: nada a fazer.
    expect(acoesDe(planejar({}, LOCAL_APAGADO, REMOTO_FORA_DO_MAPA))).toEqual([])
    // Ciclo 2 se a gravação do manifesto tivesse falhado: ainda assim nada — nunca um baixar.
    expect(acoesDe(planejar(CONHECIDO, LOCAL_APAGADO, REMOTO_FORA_DO_MAPA))).toEqual([])
  })
})

describe('matriz B — arquivo SEM entrada no manifesto', () => {
  const N = 'novo.json'

  it('existe dos dois lados com hash igual → registrar', () => {
    expect(acoesDe(planejar({}, { [N]: loc() }, { [N]: rem() }))).toEqual([{ tipo: 'registrar', caminho: N }])
  })

  it('existe dos dois lados com hash diferente → conflito', () => {
    const plano = planejar({}, { [N]: loc({ hash: HASH_LOCAL_NOVO }) }, { [N]: rem({ hash: HASH_REMOTO_NOVO }) })
    expect(acoesDe(plano)).toEqual([{ tipo: 'conflito', caminho: N, vencedor: 'local' }])
  })

  it('existe só no local → subir', () => {
    expect(acoesDe(planejar({}, { [N]: loc() }, {}))).toEqual([{ tipo: 'subir', caminho: N }])
  })

  it('existe só no remoto → baixar', () => {
    expect(acoesDe(planejar({}, {}, { [N]: rem() }))).toEqual([{ tipo: 'baixar', caminho: N }])
  })

  it('remoto sem hash → conflito, porque a igualdade não pode ser provada', () => {
    const plano = planejar({}, { [N]: loc() }, { [N]: rem({ hash: undefined }) })
    expect(acoesDe(plano)).toEqual([{ tipo: 'conflito', caminho: N, vencedor: 'local' }])
  })

  it('lápide remota de arquivo que este PC nunca teve → nenhuma ação', () => {
    expect(acoesDe(planejar({}, {}, { [N]: rem({ removido: true }) }))).toEqual([])
  })

  it('local presente + lápide remota, sem manifesto → subir', () => {
    // É a única ressurreição que escapa: o outro PC apagou o arquivo, e este nunca soube que ele
    // existia (sem entrada no manifesto, não há deleção a reconhecer). `subir` mesmo assim, porque
    // a alternativa é apagar um arquivo local presente com base numa lápide que não se correlaciona
    // com nada — destruir dado a partir de ignorância é o pior dos dois erros.
    expect(acoesDe(planejar({}, { [N]: loc() }, { [N]: rem({ removido: true }) })))
      .toEqual([{ tipo: 'subir', caminho: N }])
  })
})

describe('freio de deleção em massa', () => {
  it('dispara quando o plano apagaria mais da metade do que o manifesto conhece', () => {
    expect(planoQueApaga(10, 4)).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
  })

  it('a fronteira é > 50%: exatamente metade passa', () => {
    const metade = planoQueApaga(10, 5)
    expect(metade.ok).toBe(true)
    expect(acoesDe(metade)).toEqual(caminhos(10).slice(5).map((caminho) => ({ tipo: 'apagarRemoto', caminho })))
  })

  it('a listagem remota voltar vazia com o cofre local intacto dispara o freio', () => {
    // A direção com perda irreversível: aqui o plano apagaria o cofre LOCAL do usuário. É o
    // desenho do acidente — a listagem falha ou volta vazia, e o motor conclui que tudo sumiu.
    const todos = caminhos(10)
    const plano = planejar(entradasDe(todos), locaisDe(todos), {})
    expect(plano).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 10, total: 10 })
  })

  it('com total ímpar, a metade fracionária também só recusa acima dela', () => {
    // 11 conhecidos: 5 deleções (45%) passam, 6 (55%) recusam.
    expect(planoQueApaga(11, 6).ok).toBe(true)
    expect(planoQueApaga(11, 5).ok).toBe(false)
  })

  it('conta apagarLocal e apagarRemoto no mesmo total', () => {
    // f00–f03 só no local → apagarLocal. f04 e f05 só no remoto → apagarRemoto. O resto, nos dois.
    const todos = caminhos(10)
    const plano = planejar(
      entradasDe(todos),
      locaisDe([...todos.slice(0, 4), ...todos.slice(6)]),
      remotosDe(todos.slice(4)),
    )
    expect(plano).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
  })

  it('manifesto vazio: o primeiro sync roda inteiro, sem o freio olhar para ele', () => {
    const plano = planejar({}, locaisDe(['a.json']), remotosDe(['b.json']))
    expect(acoesDe(plano)).toEqual([
      { tipo: 'subir', caminho: 'a.json' },
      { tipo: 'baixar', caminho: 'b.json' },
    ])
  })
})

describe('freio de deleção em massa — piso de 10 arquivos', () => {
  it('abaixo do piso, um plano que apaga TUDO ainda passa', () => {
    const plano = planoQueApaga(9, 0)
    expect(plano.ok).toBe(true)
    expect(acoesDe(plano)).toHaveLength(9)
  })

  it('no piso, a regra de percentual volta a valer', () => {
    expect(planoQueApaga(10, 0)).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 10, total: 10 })
  })
})

describe('determinismo', () => {
  // `á` em NFC é U+00E1, que em unidade de código UTF-16 vale 0xE1 — acima de 'b' (0x62) e de
  // 'Z' (0x5A). Daí a ordem esperada Zelda < b < ácido. Uma collation pt-BR daria a ordem de
  // dicionário (ácido < b < Zelda), que depende de ICU, locale e versão do runtime: exatamente o
  // que este teste existe para proibir.
  const ACENTUADO = 'ácido.json'
  const ORDEM_POR_CODE_UNIT = ['Zelda.json', 'b.json', ACENTUADO]

  it('a ordem é por unidade de código, não por collation de idioma', () => {
    // Se algum editor renormalizar este arquivo para NFD, `á` vira 'a' + U+0301 e a ordem
    // esperada deixa de valer. Esta linha falha primeiro, apontando a causa real.
    expect(ACENTUADO.charCodeAt(0)).toBe(0xe1)

    const todos = [ACENTUADO, 'b.json', 'Zelda.json']
    const mudado = loc({ hash: HASH_LOCAL_NOVO })
    const plano = planejar(
      entradasDe(todos),
      Object.fromEntries(todos.map((c) => [c, mudado])),
      remotosDe(todos),
    )
    expect(acoesDe(plano).map((a) => a.caminho)).toEqual(ORDEM_POR_CODE_UNIT)
  })

  it('mesma entrada → mesmo plano, na mesma ordem, qualquer que seja a ordem dos Maps', () => {
    const m = manifestoCom({ 'b.json': entrada(), 'a.json': entrada() })
    const mudado = loc({ hash: HASH_LOCAL_NOVO })
    const locais1 = new Map([['a.json', mudado], ['b.json', mudado]])
    const locais2 = new Map([['b.json', mudado], ['a.json', mudado]])
    const remotos = new Map([['b.json', rem()], ['a.json', rem()]])

    const plano1 = reconciliar(m, locais1, remotos)
    const plano2 = reconciliar(m, locais2, remotos)

    expect(plano1).toEqual(plano2)
    expect(acoesDe(plano1)).toEqual([
      { tipo: 'subir', caminho: 'a.json' },
      { tipo: 'subir', caminho: 'b.json' },
    ])
  })
})

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

/** Caminhos `f0.json`…`f{n-1}.json`. */
function caminhos(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `f${i}.json`)
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

const A = 'a.json'

/**
 * Três arquivos intocados nos dois lados, presentes em todos os cenários da matriz A. Existem
 * porque o freio de deleção em massa mede sobre o manifesto inteiro: com um manifesto de UM
 * arquivo, qualquer deleção é 100% e o freio mascararia a célula sob teste. Eles não geram ação,
 * e `z…` ordena depois de `a.json`, então não deslocam nada nas asserções.
 */
const LASTRO = ['z0.json', 'z1.json', 'z2.json']

const CONHECIDO = { [A]: entrada(), ...entradasDe(LASTRO) }
const LOCAL_IGUAL = { [A]: loc(), ...locaisDe(LASTRO) }
const LOCAL_MUDOU = { [A]: loc({ hash: HASH_LOCAL_NOVO }), ...locaisDe(LASTRO) }
const LOCAL_APAGADO = locaisDe(LASTRO)
const REMOTO_IGUAL = { [A]: rem(), ...remotosDe(LASTRO) }
const REMOTO_MUDOU = { [A]: rem({ hash: HASH_REMOTO_NOVO, versao: 'v1' }), ...remotosDe(LASTRO) }
const REMOTO_APAGADO = { [A]: rem({ removido: true }), ...remotosDe(LASTRO) }
const REMOTO_FORA_DO_MAPA = remotosDe(LASTRO)

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

describe('matriz A — derivação de estado contra o manifesto', () => {
  it('remoto ausente do mapa vale o mesmo que removido: true', () => {
    expect(acoesDe(planejar(CONHECIDO, LOCAL_IGUAL, REMOTO_FORA_DO_MAPA)))
      .toEqual([{ tipo: 'apagarLocal', caminho: A }])
  })

  it('remoto sem hash decide por versaoRemota, e não assume "mudou"', () => {
    const mesmaVersao = { [A]: rem({ hash: undefined, versao: 'v0' }), ...remotosDe(LASTRO) }
    const outraVersao = { [A]: rem({ hash: undefined, versao: 'v9' }), ...remotosDe(LASTRO) }
    expect(acoesDe(planejar(CONHECIDO, LOCAL_IGUAL, mesmaVersao))).toEqual([])
    expect(acoesDe(planejar(CONHECIDO, LOCAL_IGUAL, outraVersao))).toEqual([{ tipo: 'baixar', caminho: A }])
  })

  it('regressão: arquivo apagado local não ressuscita no ciclo seguinte', () => {
    // Ciclo 1: só o local apagou; o remoto continua idêntico ao manifesto.
    expect(acoesDe(planejar(CONHECIDO, LOCAL_APAGADO, REMOTO_IGUAL)))
      .toEqual([{ tipo: 'apagarRemoto', caminho: A }])
    // Ciclo 2, manifesto já atualizado pelo executor: nada a fazer.
    expect(acoesDe(planejar(entradasDe(LASTRO), LOCAL_APAGADO, REMOTO_FORA_DO_MAPA))).toEqual([])
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
})

describe('freio de deleção em massa', () => {
  it('dispara quando o plano apagaria mais da metade do que o manifesto conhece', () => {
    // 4 conhecidos, o local só tem 1 → 3 apagarRemoto.
    const plano = planejar(entradasDe(caminhos(4)), locaisDe(caminhos(4).slice(0, 1)), remotosDe(caminhos(4)))
    expect(plano).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 3, total: 4 })
  })

  it('a fronteira é > 50%: exatamente metade passa, um a mais recusa', () => {
    const metade = planejar(entradasDe(caminhos(4)), locaisDe(caminhos(4).slice(0, 2)), remotosDe(caminhos(4)))
    expect(metade.ok).toBe(true)
    expect(acoesDe(metade)).toEqual([
      { tipo: 'apagarRemoto', caminho: 'f2.json' },
      { tipo: 'apagarRemoto', caminho: 'f3.json' },
    ])

    const umAMais = planejar(entradasDe(caminhos(4)), locaisDe(caminhos(4).slice(0, 1)), remotosDe(caminhos(4)))
    expect(umAMais.ok).toBe(false)
  })

  it('com total ímpar, a metade fracionária também só recusa acima dela', () => {
    // 3 conhecidos: 1 deleção (33%) passa, 2 (67%) recusa.
    expect(planejar(entradasDe(caminhos(3)), locaisDe(caminhos(3).slice(0, 2)), remotosDe(caminhos(3))).ok).toBe(true)
    expect(planejar(entradasDe(caminhos(3)), locaisDe(caminhos(3).slice(0, 1)), remotosDe(caminhos(3))).ok).toBe(false)
  })

  it('conta apagarLocal e apagarRemoto no mesmo total', () => {
    // f0,f1: só local → apagarLocal. f2: só remoto → apagarRemoto. f3: os dois → nada.
    const plano = planejar(
      entradasDe(caminhos(4)),
      locaisDe(['f0.json', 'f1.json', 'f3.json']),
      remotosDe(['f2.json', 'f3.json']),
    )
    expect(plano).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 3, total: 4 })
  })

  it('manifesto vazio com arquivos dos dois lados não trava nem divide por zero', () => {
    const plano = planejar({}, locaisDe(['a.json']), remotosDe(['b.json']))
    expect(acoesDe(plano)).toEqual([
      { tipo: 'subir', caminho: 'a.json' },
      { tipo: 'baixar', caminho: 'b.json' },
    ])
  })
})

describe('determinismo', () => {
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

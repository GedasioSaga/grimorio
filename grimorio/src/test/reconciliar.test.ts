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

describe('conflito de política metadado: vence a edição mais recente', () => {
  const METADADO = 'campanha.json'
  const CONHECIDO_METADADO = { [METADADO]: entrada() }

  it('remoto claramente mais novo (fora do clock skew) → vencedor remoto', () => {
    const local = { [METADADO]: loc({ hash: HASH_LOCAL_NOVO, mtime: 1000 }) }
    const remoto = { [METADADO]: rem({ hash: HASH_REMOTO_NOVO, versao: 'v1', modificadoEm: 1000 + 5000 }) }
    expect(acoesDe(planejar(CONHECIDO_METADADO, local, remoto)))
      .toEqual([{ tipo: 'conflito', caminho: METADADO, vencedor: 'remoto' }])
  })

  it('diferença dentro do clock skew (2s) mantém o vencedor local', () => {
    const local = { [METADADO]: loc({ hash: HASH_LOCAL_NOVO, mtime: 1000 }) }
    const remoto = { [METADADO]: rem({ hash: HASH_REMOTO_NOVO, versao: 'v1', modificadoEm: 1000 + 1500 }) }
    expect(acoesDe(planejar(CONHECIDO_METADADO, local, remoto)))
      .toEqual([{ tipo: 'conflito', caminho: METADADO, vencedor: 'local' }])
  })

  it('local mais novo → vencedor continua local', () => {
    const local = { [METADADO]: loc({ hash: HASH_LOCAL_NOVO, mtime: 10_000 }) }
    const remoto = { [METADADO]: rem({ hash: HASH_REMOTO_NOVO, versao: 'v1', modificadoEm: 1000 }) }
    expect(acoesDe(planejar(CONHECIDO_METADADO, local, remoto)))
      .toEqual([{ tipo: 'conflito', caminho: METADADO, vencedor: 'local' }])
  })

  it('sem modificadoEm do Drive (não disponível), mantém o vencedor provisório local', () => {
    const local = { [METADADO]: loc({ hash: HASH_LOCAL_NOVO }) }
    const remoto = { [METADADO]: rem({ hash: HASH_REMOTO_NOVO, versao: 'v1' }) }
    expect(acoesDe(planejar(CONHECIDO_METADADO, local, remoto)))
      .toEqual([{ tipo: 'conflito', caminho: METADADO, vencedor: 'local' }])
  })

  it('arquivo de entidade (não-metadado) continua vencendo local mesmo com remoto muito mais novo', () => {
    const local = { [A]: loc({ hash: HASH_LOCAL_NOVO, mtime: 1000 }) }
    const remoto = { [A]: rem({ hash: HASH_REMOTO_NOVO, versao: 'v1', modificadoEm: 999_999 }) }
    expect(acoesDe(planejar(CONHECIDO, local, remoto)))
      .toEqual([{ tipo: 'conflito', caminho: A, vencedor: 'local' }])
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

/**
 * Renomeação = o arquivo some de um caminho e reaparece em outro com o MESMO conteúdo. É o que o
 * "Organizar imagens" faz em massa: o plano continua sendo apagar + subir (o Drive não sabe
 * renomear por hash), mas o freio não pode ler isso como o cofre sumindo — senão um cofre com
 * muita imagem nunca mais sincroniza depois de organizado.
 */
describe('freio de deleção em massa — renomeação não é deleção', () => {
  /** `n` caminhos antigos com hashes únicos `h00`…, para o pareamento ter o que casar. */
  function manifestoComHashes(n: number): Record<string, EntradaArquivo> {
    return Object.fromEntries(caminhos(n).map((c, i) => [c, entrada({ hash: `h${String(i).padStart(2, '0')}` })]))
  }
  const hashDe = (i: number) => `h${String(i).padStart(2, '0')}`
  const novo = (i: number) => `imagens/n${String(i).padStart(2, '0')}.png`
  /** `ultimoSync` de `manifestoCom`, e dois instantes do Drive: bem depois dele e bem antes. */
  const ULTIMO_SYNC_MS = Date.parse('2026-07-26T12:00:00Z')
  const DEPOIS_DO_SYNC = ULTIMO_SYNC_MS + 5 * 60_000
  const ANTES_DO_SYNC = ULTIMO_SYNC_MS - 24 * 3_600_000

  it('40 renomeações num manifesto de 50 não disparam o freio (as ações continuam apagar + subir)', () => {
    const todos = caminhos(50)
    const locais: Record<string, EstadoLocal> = {}
    todos.slice(0, 10).forEach((c, i) => { locais[c] = loc({ hash: hashDe(i) }) })
    for (let i = 10; i < 50; i++) locais[novo(i)] = loc({ hash: hashDe(i) })
    const remotos = Object.fromEntries(todos.map((c, i) => [c, rem({ hash: hashDe(i) })]))

    const acoes = acoesDe(planejar(manifestoComHashes(50), locais, remotos))
    expect(acoes.filter((a) => a.tipo === 'apagarRemoto')).toHaveLength(40)
    expect(acoes.filter((a) => a.tipo === 'subir')).toHaveLength(40)
  })

  it('cofre que já tinha a pasta "Imagens" (I maiúsculo): organizar e desfazer não disparam o freio', () => {
    // O NTFS não distingue caixa: o organizador escreve em `imagens/...`, o arquivo cai dentro da
    // `Imagens/` que já existia e a varredura devolve o nome como está no disco. Visto no cofre
    // real: 834 "deleções" de 1598 e o sync travado logo depois de organizar.
    const todos = Array.from({ length: 50 }, (_, i) => `imagens-canvas/c${String(i).padStart(2, '0')}.png`)
    const naPastaMaiuscula = (i: number) => `Imagens/personagens/P${i}/retrato.png`
    const antes = Object.fromEntries(todos.map((c, i) => [c, entrada({ hash: hashDe(i) })]))

    const organizou: Record<string, EstadoLocal> = {}
    todos.slice(0, 10).forEach((c, i) => { organizou[c] = loc({ hash: hashDe(i) }) })
    for (let i = 10; i < 50; i++) organizou[naPastaMaiuscula(i)] = loc({ hash: hashDe(i) })
    const remotosAntigos = Object.fromEntries(todos.map((c, i) => [c, rem({ hash: hashDe(i) })]))
    expect(acoesDe(planejar(antes, organizou, remotosAntigos))
      .filter((a) => a.tipo === 'apagarRemoto')).toHaveLength(40)

    const organizado = Object.fromEntries(Object.entries(organizou).map(([c, e]) => [c, entrada({ hash: e.hash })]))
    const desfez = Object.fromEntries(todos.map((c, i) => [c, loc({ hash: hashDe(i) })]))
    const remotosOrganizados = Object.fromEntries(Object.entries(organizou).map(([c, e]) => [c, rem({ hash: e.hash })]))
    expect(acoesDe(planejar(organizado, desfez, remotosOrganizados))
      .filter((a) => a.tipo === 'apagarRemoto')).toHaveLength(40)
  })

  it('40 deleções reais (conteúdo novo diferente) no mesmo manifesto disparam', () => {
    const todos = caminhos(50)
    const locais: Record<string, EstadoLocal> = {}
    todos.slice(0, 10).forEach((c, i) => { locais[c] = loc({ hash: hashDe(i) }) })
    for (let i = 10; i < 50; i++) locais[novo(i)] = loc({ hash: `outro${i}` })
    const remotos = Object.fromEntries(todos.map((c, i) => [c, rem({ hash: hashDe(i) })]))

    expect(planejar(manifestoComHashes(50), locais, remotos))
      .toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 40, total: 50 })
  })

  it('renomeação feita no OUTRO computador depois do último sync (apagarLocal + baixar de mesmo hash) não dispara', () => {
    const todos = caminhos(50)
    const locais = Object.fromEntries(todos.map((c, i) => [c, loc({ hash: hashDe(i) })]))
    const remotos: Record<string, EstadoRemoto> = {}
    todos.slice(0, 10).forEach((c, i) => { remotos[c] = rem({ hash: hashDe(i) }) })
    for (let i = 10; i < 50; i++) {
      remotos[todos[i]] = rem({ hash: hashDe(i), removido: true })
      remotos[novo(i)] = rem({ fileId: `n${i}`, hash: hashDe(i), modificadoEm: DEPOIS_DO_SYNC })
    }

    const acoes = acoesDe(planejar(manifestoComHashes(50), locais, remotos))
    expect(acoes.filter((a) => a.tipo === 'apagarLocal')).toHaveLength(40)
    expect(acoes.filter((a) => a.tipo === 'baixar')).toHaveLength(40)
  })

  it('listagem atrasada do Drive logo depois de organizar (Y ainda não aparece, X ainda vivo) dispara o freio', () => {
    // Este PC organizou X → Y e já sincronizou: o manifesto conhece Y e não conhece X. A listagem
    // seguinte chega velha: X (apagado lá há pouco) ainda aparece vivo, Y (subido há pouco) ainda
    // não aparece. O motor quer apagar Y aqui (apagarLocal) e baixar X de volta (baixar), com o
    // mesmo hash — mas X é um arquivo ANTIGO, não algo que o outro PC criou depois do último
    // sync. Parear isso apagaria as imagens organizadas sem o freio perguntar nada.
    const mantidos = caminhos(10)
    const velhos = caminhos(50).slice(10)
    const arquivos: Record<string, EntradaArquivo> = {}
    const locais: Record<string, EstadoLocal> = {}
    const remotos: Record<string, EstadoRemoto> = {}
    mantidos.forEach((c, i) => {
      arquivos[c] = entrada({ hash: hashDe(i) })
      locais[c] = loc({ hash: hashDe(i) })
      remotos[c] = rem({ hash: hashDe(i) })
    })
    for (let i = 10; i < 50; i++) {
      arquivos[novo(i)] = entrada({ hash: hashDe(i) })
      locais[novo(i)] = loc({ hash: hashDe(i) })
      remotos[velhos[i - 10]] = rem({ fileId: `x${i}`, hash: hashDe(i), modificadoEm: ANTES_DO_SYNC })
    }

    expect(planejar(arquivos, locais, remotos)).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 40, total: 50 })
  })

  it('criação remota que não é claramente posterior ao último sync (dentro da folga de relógio, ou sem data) não prova renomeação', () => {
    for (const modificadoEm of [ULTIMO_SYNC_MS + 1_000, undefined]) {
      const todos = caminhos(10)
      const locais = Object.fromEntries(todos.map((c, i) => [c, loc({ hash: hashDe(i) })]))
      const remotos: Record<string, EstadoRemoto> = {}
      for (let i = 0; i < 10; i++) {
        remotos[todos[i]] = rem({ hash: hashDe(i), removido: i >= 4 })
        if (i >= 4) remotos[novo(i)] = rem({ fileId: `n${i}`, hash: hashDe(i), modificadoEm })
      }
      expect(planejar(manifestoComHashes(10), locais, remotos))
        .toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
    }
  })

  it('sentidos não se misturam: sumir DAQUI (apagarRemoto) não casa com chegar DE LÁ (baixar)', () => {
    const todos = caminhos(10)
    const locais: Record<string, EstadoLocal> = {}
    todos.slice(0, 4).forEach((c, i) => { locais[c] = loc({ hash: hashDe(i) }) })
    const remotos: Record<string, EstadoRemoto> = Object.fromEntries(todos.map((c, i) => [c, rem({ hash: hashDe(i) })]))
    for (let i = 4; i < 10; i++) remotos[novo(i)] = rem({ fileId: `n${i}`, hash: hashDe(i), modificadoEm: DEPOIS_DO_SYNC })

    const plano = planejar(manifestoComHashes(10), locais, remotos)
    expect(plano).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
  })

  it('sentidos não se misturam: sumir DE LÁ (apagarLocal) não casa com chegar DAQUI (subir)', () => {
    const todos = caminhos(10)
    const locais: Record<string, EstadoLocal> = Object.fromEntries(todos.map((c, i) => [c, loc({ hash: hashDe(i) })]))
    for (let i = 4; i < 10; i++) locais[novo(i)] = loc({ hash: hashDe(i) })
    const remotos: Record<string, EstadoRemoto> = {}
    todos.forEach((c, i) => { remotos[c] = rem({ hash: hashDe(i), removido: i >= 4 }) })

    const plano = planejar(manifestoComHashes(10), locais, remotos)
    expect(plano).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
  })

  it('pareamento é 1:1 — duas deleções de mesmo hash com UMA criação só descontam uma', () => {
    // 7 cópias idênticas apagadas, 1 arquivo novo com o mesmo conteúdo: 6 continuam deleção (> 5).
    const todos = caminhos(10)
    const arquivos = Object.fromEntries(todos.map((c, i) => [c, entrada({ hash: i < 7 ? 'HX' : hashDe(i) })]))
    const locais: Record<string, EstadoLocal> = { [novo(0)]: loc({ hash: 'HX' }) }
    todos.slice(7).forEach((c, j) => { locais[c] = loc({ hash: hashDe(j + 7) }) })
    const remotos = Object.fromEntries(todos.map((c) => [c, rem({ hash: arquivos[c].hash })]))

    expect(planejar(arquivos, locais, remotos)).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
  })

  it('criação remota sem hash não prova renomeação: a deleção continua contando', () => {
    const todos = caminhos(10)
    const locais = Object.fromEntries(todos.map((c, i) => [c, loc({ hash: hashDe(i) })]))
    const remotos: Record<string, EstadoRemoto> = {}
    for (let i = 0; i < 10; i++) {
      remotos[todos[i]] = rem({ hash: hashDe(i), removido: i >= 4 })
      if (i >= 4) remotos[novo(i)] = rem({ fileId: `n${i}`, hash: undefined, modificadoEm: DEPOIS_DO_SYNC })
    }

    expect(planejar(manifestoComHashes(10), locais, remotos))
      .toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
  })

  it('pareamento é 1:1 também no sentido remoto — duas apagarLocal de mesmo hash com UM baixar só descontam uma', () => {
    // 7 arquivos sumiram no outro PC, dois deles cópias idênticas (HX); de lá chegou UM arquivo HX
    // novo. Só uma das duas cópias pareia: 6 continuam deleção (> 5).
    const todos = caminhos(10)
    const arquivos = Object.fromEntries(todos.map((c, i) => [c, entrada({ hash: i < 2 ? 'HX' : hashDe(i) })]))
    const locais = Object.fromEntries(todos.map((c) => [c, loc({ hash: arquivos[c].hash })]))
    const remotos: Record<string, EstadoRemoto> = {}
    todos.forEach((c, i) => { remotos[c] = rem({ hash: arquivos[c].hash, removido: i < 7 }) })
    remotos[novo(0)] = rem({ fileId: 'n0', hash: 'HX', modificadoEm: DEPOIS_DO_SYNC })

    expect(planejar(arquivos, locais, remotos)).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
  })

  it('ultimoSync ilegível (NaN): criação remota não prova nada, criação local continua pareando', () => {
    const todos = caminhos(50)
    const manifesto = { ...manifestoCom(manifestoComHashes(50)), ultimoSync: 'lixo' }
    expect(Date.parse(manifesto.ultimoSync)).toBeNaN()

    // renomeação vinda do OUTRO PC: sem data do último sync, nenhum baixar é "posterior" a ele
    const locaisIguais = Object.fromEntries(todos.map((c, i) => [c, loc({ hash: hashDe(i) })]))
    const remotosRenomeados: Record<string, EstadoRemoto> = {}
    todos.forEach((c, i) => {
      remotosRenomeados[c] = rem({ hash: hashDe(i), removido: i >= 10 })
      if (i >= 10) remotosRenomeados[novo(i)] = rem({ fileId: `n${i}`, hash: hashDe(i), modificadoEm: DEPOIS_DO_SYNC })
    })
    expect(reconciliar(manifesto, new Map(Object.entries(locaisIguais)), new Map(Object.entries(remotosRenomeados))))
      .toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 40, total: 50 })

    // renomeação feita AQUI não depende de data nenhuma
    const locaisRenomeados: Record<string, EstadoLocal> = {}
    todos.forEach((c, i) => { locaisRenomeados[i < 10 ? c : novo(i)] = loc({ hash: hashDe(i) }) })
    const remotosIguais = Object.fromEntries(todos.map((c, i) => [c, rem({ hash: hashDe(i) })]))
    const plano = reconciliar(manifesto, new Map(Object.entries(locaisRenomeados)), new Map(Object.entries(remotosIguais)))
    expect(acoesDe(plano).filter((a) => a.tipo === 'apagarRemoto')).toHaveLength(40)
  })

  /** Os 10 arquivos `de(i)` reaparecem NESTE PC em `para(i)`, mesmo conteúdo; o Drive ainda tem os velhos. */
  function renomeadosAqui(de: (i: number) => string, para: (i: number) => string): Plano {
    const ids = Array.from({ length: 10 }, (_, i) => i)
    return planejar(
      Object.fromEntries(ids.map((i) => [de(i), entrada({ hash: hashDe(i) })])),
      Object.fromEntries(ids.map((i) => [para(i), loc({ hash: hashDe(i) })])),
      Object.fromEntries(ids.map((i) => [de(i), rem({ hash: hashDe(i) })])),
    )
  }

  /**
   * Derivas que o cofre sofre sem ninguém renomear nada: a mesma pasta lida em NFD (cópia vinda de
   * macOS, zip), noutra caixa, ou a raiz montada um nível acima ou abaixo. O conteúdo é o mesmo dos
   * dois lados, então o hash bate — e parear só por hash leria o cofre inteiro trocando de endereço
   * como renomeação, sem o freio perguntar nada. O nome do arquivo é ASCII de propósito: só a pasta
   * deriva, e "mesmo nome de arquivo" sozinho não pegaria nenhuma destas.
   */
  const ORIGINAIS = Array.from({ length: 10 }, (_, i) => `Anotações/sessao-${String(i).padStart(2, '0')}.json`.normalize('NFC'))
  const DERIVAS: [string, (c: string) => string][] = [
    ['NFD', (c) => c.normalize('NFD')],
    ['caixa', (c) => c.toLowerCase()],
    ['pasta a mais na raiz', (c) => `grimorio/${c}`],
    ['pasta a menos na raiz', (c) => c.slice(c.indexOf('/') + 1)],
    ['pasta a mais e NFD', (c) => `grimorio/${c.normalize('NFD')}`],
  ]

  /** Os originais derivados, conferindo que a deriva muda mesmo a chave — senão o teste não prova nada. */
  function derivados(nome: string, derivar: (c: string) => string): string[] {
    return ORIGINAIS.map((c) => {
      const d = derivar(c)
      expect(d, nome).not.toBe(c)
      return d
    })
  }

  it('deriva de caminho NESTE computador (NFD, caixa, pasta da raiz a mais ou a menos) não é renomeação: dispara', () => {
    for (const [nome, derivar] of DERIVAS) {
      const para = derivados(nome, derivar)
      expect(renomeadosAqui((i) => ORIGINAIS[i], (i) => para[i]), nome)
        .toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 10, total: 10 })
    }
  })

  it('a mesma deriva chegando do OUTRO computador (apagarLocal + baixar de mesmo hash) também dispara', () => {
    for (const [nome, derivar] of DERIVAS) {
      const arquivos = Object.fromEntries(ORIGINAIS.map((c, i) => [c, entrada({ hash: hashDe(i) })]))
      const locais = Object.fromEntries(ORIGINAIS.map((c, i) => [c, loc({ hash: hashDe(i) })]))
      const remotos: Record<string, EstadoRemoto> = {}
      ORIGINAIS.forEach((c, i) => { remotos[c] = rem({ hash: hashDe(i), removido: true }) })
      derivados(nome, derivar).forEach((d, i) => {
        remotos[d] = rem({ fileId: `d${i}`, hash: hashDe(i), modificadoEm: DEPOIS_DO_SYNC })
      })

      expect(planejar(arquivos, locais, remotos), nome)
        .toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 10, total: 10 })
    }
  })

  it('raiz descendo um nível num cofre já organizado dispara, mesmo com o destino sob imagens/', () => {
    // `Grimorio/imagens/x.png` virando `imagens/x.png` é a raiz que mudou, não o organizador: o
    // teste de "pasta a menos" tem de vir antes do atalho do organizador.
    const plano = renomeadosAqui(
      (i) => `Grimorio/imagens/personagens/P${String(i).padStart(2, '0')}/retrato.png`,
      (i) => `imagens/personagens/P${String(i).padStart(2, '0')}/retrato.png`,
    )
    expect(plano).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 10, total: 10 })
  })

  it('mesmo conteúdo com outro nome, fora do organizador, é deleção: hash igual sozinho não prova renomeação', () => {
    // O organizador só escreve IMAGEM sob `imagens/`. Nome de arquivo diferente em qualquer outro
    // lugar — ou um não-imagem sob `imagens/` — não tem como provar que é o mesmo arquivo.
    const destinos: [string, (i: number) => string][] = [
      ['outra pasta, outro nome', (i) => `outra/x${String(i).padStart(2, '0')}.json`],
      ['sob imagens/, mas não é imagem', (i) => `imagens/x${String(i).padStart(2, '0')}.json`],
      ['imagem fora de imagens/', (i) => `fotos/x${String(i).padStart(2, '0')}.png`],
    ]
    const velhos = caminhos(10)
    for (const [nome, destino] of destinos) {
      expect(renomeadosAqui((i) => velhos[i], destino), nome)
        .toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 10, total: 10 })
    }
  })

  it('mover uma pasta mantendo o nome dos arquivos (mover um cenário) continua sendo renomeação', () => {
    const plano = renomeadosAqui(
      (i) => `cenarios/Norte/c${String(i).padStart(2, '0')}.json`,
      (i) => `cenarios/Sul/c${String(i).padStart(2, '0')}.json`,
    )
    expect(acoesDe(plano).filter((a) => a.tipo === 'apagarRemoto')).toHaveLength(10)
  })

  it('o organizador pondo a pasta antiga inteira sob imagens/ é renomeação, não "pasta a mais na raiz"', () => {
    // `mapas/Masmorra/01.png` vira `imagens/mapas/Masmorra/01.png`: o caminho velho é sufixo do novo,
    // igualzinho à deriva de raiz. O que separa os dois é o destino ser imagem sob `imagens/`.
    const plano = renomeadosAqui(
      (i) => `mapas/Masmorra/${String(i).padStart(2, '0')}.png`,
      (i) => `imagens/mapas/Masmorra/${String(i).padStart(2, '0')}.png`,
    )
    expect(acoesDe(plano).filter((a) => a.tipo === 'apagarRemoto')).toHaveLength(10)
  })

  it('A organizou 200 imagens e B editou 1 retrato offline: B sincroniza sem freio, e a ficha de B vence o conflito', () => {
    // 100 personagens, cada um com ficha, retrato e 1 imagem de galeria (300 arquivos conhecidos).
    // A organizou tudo e sincronizou: as imagens mudaram de endereço E de nome, e as fichas foram
    // reescritas para citar o endereço novo. B, offline, trocou o retrato do P000.
    const n3 = (i: number) => String(i).padStart(3, '0')
    const ficha = (i: number) => `personagens/P${n3(i)}.json`
    const arquivos: Record<string, EntradaArquivo> = {}
    const locais: Record<string, EstadoLocal> = {}
    const remotos: Record<string, EstadoRemoto> = {}
    for (let i = 0; i < 100; i++) {
      arquivos[ficha(i)] = entrada({ hash: `ficha-${n3(i)}` })
      locais[ficha(i)] = loc({ hash: `ficha-${n3(i)}` })
      remotos[ficha(i)] = rem({ fileId: `fp${i}`, hash: `ficha-${n3(i)}-v2`, versao: 'v1', modificadoEm: DEPOIS_DO_SYNC })
      const imagens: [string, string, string][] = [
        [`retratos/retrato-p${n3(i)}-u.png`, `imagens/personagens/P${n3(i)}/retrato.png`, `retrato-${n3(i)}`],
        [`galeria/p${n3(i)}-1.png`, `imagens/personagens/P${n3(i)}/galeria-1.png`, `galeria-${n3(i)}`],
      ]
      for (const [antigo, organizado, hash] of imagens) {
        arquivos[antigo] = entrada({ hash })
        locais[antigo] = loc({ hash })
        remotos[antigo] = rem({ hash, removido: true })
        remotos[organizado] = rem({ fileId: `o-${organizado}`, hash, modificadoEm: DEPOIS_DO_SYNC })
      }
    }
    delete locais['retratos/retrato-p000-u.png']
    locais['retratos/retrato-p000-u2.png'] = loc({ hash: 'retrato-000-b' })
    locais[ficha(0)] = loc({ hash: 'ficha-000-b' })

    const acoes = acoesDe(planejar(arquivos, locais, remotos))
    const contar = (tipo: Acao['tipo']) => acoes.filter((a) => a.tipo === tipo).length
    expect(contar('apagarLocal')).toBe(199) // 99 retratos + 100 galerias no endereço velho
    expect(contar('baixar')).toBe(299) // 99 fichas reescritas + 200 imagens organizadas
    expect(contar('subir')).toBe(1) // o retrato novo de B
    expect(acoes.filter((a) => a.tipo === 'conflito')).toEqual([{ tipo: 'conflito', caminho: ficha(0), vencedor: 'local' }])
    expect(acoes).toHaveLength(500)
  })

  const n2 = (i: number) => String(i).padStart(2, '0')
  /** O mesmo retrato antes e depois de organizar: muda de pasta E de nome. */
  const antigo = (i: number) => `retratos/retrato-p${n2(i)}-u.png`
  const organizado = (i: number) => `imagens/personagens/P${n2(i)}/retrato.png`

  /**
   * Desfazer a organização é a renomeação ao contrário: a imagem sai de `imagens/` e volta ao endereço
   * e ao nome antigos. Sem par, o cofre passava no freio na ida e engatava na volta.
   */
  it('desfazer a organização NESTE computador (a imagem sai de imagens/ e volta ao endereço antigo) não dispara', () => {
    const plano = renomeadosAqui(organizado, antigo)
    expect(acoesDe(plano).filter((a) => a.tipo === 'apagarRemoto')).toHaveLength(10)
  })

  it('desfazer de quem pôs a pasta antiga inteira sob imagens/ também é renomeação, não "pasta a menos na raiz"', () => {
    // A volta de `mapas/Masmorra/01.png` → `imagens/mapas/Masmorra/01.png`: o caminho novo é o velho sem a
    // primeira pasta, igualzinho à raiz descendo um nível. O que separa os dois é a ORIGEM ser imagem sob imagens/.
    const plano = renomeadosAqui(
      (i) => `imagens/mapas/Masmorra/${n2(i)}.png`,
      (i) => `mapas/Masmorra/${n2(i)}.png`,
    )
    expect(acoesDe(plano).filter((a) => a.tipo === 'apagarRemoto')).toHaveLength(10)
  })

  it('desfazer feito no OUTRO computador (apagarLocal sob imagens/ + baixar do endereço antigo) não dispara', () => {
    const ids = Array.from({ length: 10 }, (_, i) => i)
    const remotos: Record<string, EstadoRemoto> = {}
    for (const i of ids) {
      remotos[organizado(i)] = rem({ hash: hashDe(i), removido: true })
      remotos[antigo(i)] = rem({ fileId: `a${i}`, hash: hashDe(i), modificadoEm: DEPOIS_DO_SYNC })
    }
    const acoes = acoesDe(planejar(
      Object.fromEntries(ids.map((i) => [organizado(i), entrada({ hash: hashDe(i) })])),
      Object.fromEntries(ids.map((i) => [organizado(i), loc({ hash: hashDe(i) })])),
      remotos,
    ))
    expect(acoes.filter((a) => a.tipo === 'apagarLocal')).toHaveLength(10)
    expect(acoes.filter((a) => a.tipo === 'baixar')).toHaveLength(10)
  })

  it('a raiz subindo um nível num cofre organizado continua disparando, mesmo com a origem sob imagens/', () => {
    // a regra do desfazer não pode engolir `imagens/x` → `Grimorio/imagens/x`: aí é o cofre que mudou de endereço
    expect(renomeadosAqui(organizado, (i) => `Grimorio/${organizado(i)}`))
      .toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 10, total: 10 })
  })

  /**
   * Renomeação que atravessa ciclos: o endereço novo já sincronizou num ciclo anterior (está no
   * manifesto, vivo e igual dos dois lados) e só agora o velho some. Acontece quando o outro PC organiza
   * num upload longo — este baixa parte dos novos num ciclo e só vê os velhos sumirem no seguinte — e
   * quando o executor adia o apagar da imagem velha porque a ficha que a citava não subiu.
   */
  it('renomeação que atravessou ciclos (o endereço novo já sincronizado, igual dos dois lados) não engata o freio', () => {
    // 10 fichas e 40 retratos. O outro PC organizou os 40 e terminou: os antigos sumiram do Drive. Este PC
    // baixou 20 dos novos no ciclo anterior; os outros 20 chegam agora sem prova de data, porque subiram
    // enquanto aquele ciclo rodava (antes do fim dele, que é o `ultimoSync`).
    const arquivos: Record<string, EntradaArquivo> = {}
    const locais: Record<string, EstadoLocal> = {}
    const remotos: Record<string, EstadoRemoto> = {}
    caminhos(10).forEach((c, i) => {
      arquivos[c] = entrada({ hash: `ficha-${i}` })
      locais[c] = loc({ hash: `ficha-${i}` })
      remotos[c] = rem({ hash: `ficha-${i}` })
    })
    for (let i = 0; i < 40; i++) {
      arquivos[antigo(i)] = entrada({ hash: hashDe(i) })
      locais[antigo(i)] = loc({ hash: hashDe(i) })
      if (i < 20) {
        arquivos[organizado(i)] = entrada({ hash: hashDe(i) })
        locais[organizado(i)] = loc({ hash: hashDe(i) })
      }
      remotos[organizado(i)] = rem({ fileId: `o${i}`, hash: hashDe(i), modificadoEm: ULTIMO_SYNC_MS - 10_000 })
    }

    const acoes = acoesDe(planejar(arquivos, locais, remotos))
    expect(acoes.filter((a) => a.tipo === 'apagarLocal')).toHaveLength(40)
    expect(acoes.filter((a) => a.tipo === 'baixar')).toHaveLength(20)
  })

  it('endereço já sincronizado desconta UMA deleção só: duas cópias apagadas de mesmo conteúdo continuam uma deleção', () => {
    // galeria/a.png e galeria/b.png (mesmo conteúdo HX) sumiram daqui; imagens/w.png (HX) já estava
    // sincronizado. Mais 5 deleções reais e 2 arquivos intactos: com o 1:1 sobram 6 deleções (> 5).
    const arquivos: Record<string, EntradaArquivo> = {
      'galeria/a.png': entrada({ hash: 'HX' }),
      'galeria/b.png': entrada({ hash: 'HX' }),
      'imagens/w.png': entrada({ hash: 'HX' }),
    }
    const locais: Record<string, EstadoLocal> = { 'imagens/w.png': loc({ hash: 'HX' }) }
    const remotos: Record<string, EstadoRemoto> = {
      'galeria/a.png': rem({ hash: 'HX' }),
      'galeria/b.png': rem({ hash: 'HX' }),
      'imagens/w.png': rem({ hash: 'HX' }),
    }
    caminhos(7).forEach((c, i) => {
      arquivos[c] = entrada({ hash: hashDe(i) })
      remotos[c] = rem({ hash: hashDe(i) })
      if (i >= 5) locais[c] = loc({ hash: hashDe(i) })
    })

    expect(planejar(arquivos, locais, remotos)).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
  })

  it('endereço conhecido que não está igual dos dois lados, ou que não tem cara de renomeação, não desconta', () => {
    const variantes: [string, string, string, EstadoLocal, EstadoRemoto][] = [
      ['mudou aqui', 'galeria/a.png', 'imagens/w.png', loc({ hash: 'HY' }), rem({ hash: 'HX' })],
      ['mudou lá', 'galeria/a.png', 'imagens/w.png', loc({ hash: 'HX' }), rem({ hash: 'HY', versao: 'v1' })],
      // sem hash, o Drive diz que não mudou (mesma versão) mas não prova que o conteúdo é o do apagado
      ['Drive sem hash', 'galeria/a.png', 'imagens/w.png', loc({ hash: 'HX' }), rem({ hash: undefined })],
      ['outro nome fora de imagens/', 'notas/a.json', 'outra/w.json', loc({ hash: 'HX' }), rem({ hash: 'HX' })],
    ]
    for (const [nome, apagado, gemeo, localGemeo, remotoGemeo] of variantes) {
      // o apagado e mais 5 deleções reais, contra o gêmeo e 2 arquivos intactos: 6 deleções (> 5) se o gêmeo não desconta
      const arquivos: Record<string, EntradaArquivo> = { [apagado]: entrada({ hash: 'HX' }), [gemeo]: entrada({ hash: 'HX' }) }
      const locais: Record<string, EstadoLocal> = { [gemeo]: localGemeo }
      const remotos: Record<string, EstadoRemoto> = { [apagado]: rem({ hash: 'HX' }), [gemeo]: remotoGemeo }
      caminhos(8).forEach((c, i) => {
        arquivos[c] = entrada({ hash: hashDe(i) })
        remotos[c] = rem({ hash: hashDe(i) })
        if (i >= 5) locais[c] = loc({ hash: hashDe(i) })
      })

      expect(planejar(arquivos, locais, remotos), nome).toEqual({ ok: false, motivo: 'delecao-em-massa', apagaria: 6, total: 10 })
    }
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

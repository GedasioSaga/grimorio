import { describe, expect, it } from 'vitest'
import { reconstruirManifesto, type Desfecho, type EstadoPosCiclo } from '../lib/sync/reconstruir'
import type { EntradaArquivo, EstadoLocal, EstadoRemoto, Manifesto } from '../lib/sync/tipos'

const AGORA = '2026-07-27T10:00:00.000Z'
const A = 'a.json'

function ent(over: Partial<EntradaArquivo> = {}): EntradaArquivo {
  return { fileId: 'f-velho', hash: 'H0', tamanho: 10, mtimeLocal: 1000, versaoRemota: 'v0', ...over }
}

function loc(over: Partial<EstadoLocal> = {}): EstadoLocal {
  return { hash: 'H0', tamanho: 10, mtime: 1000, ...over }
}

function rem(over: Partial<EstadoRemoto> = {}): EstadoRemoto {
  return { fileId: 'f-velho', hash: 'H0', versao: 'v0', ...over }
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
    pastas: { velha: 'p-velha' },
    arquivos: {},
    ...over,
  }
}

interface Cenario {
  anterior?: Manifesto
  local?: Record<string, EstadoLocal>
  remoto?: Record<string, EstadoRemoto>
  concluidos?: Record<string, Desfecho>
  falhados?: string[]
  pastas?: Record<string, string>
}

function reconstruir(cenario: Cenario): Manifesto {
  const estado: EstadoPosCiclo = {
    anterior: cenario.anterior ?? manifesto(),
    local: new Map(Object.entries(cenario.local ?? {})),
    remoto: new Map(Object.entries(cenario.remoto ?? {})),
    concluidos: new Map(Object.entries(cenario.concluidos ?? {})),
    falhados: new Set(cenario.falhados ?? []),
  }
  return reconstruirManifesto(estado, new Map(Object.entries(cenario.pastas ?? {})), AGORA)
}

describe('caminho sem ação — reconstruído do estado vivo', () => {
  it('vivo dos dois lados continua no manifesto', () => {
    const arquivos = reconstruir({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc() },
      remoto: { [A]: rem() },
    }).arquivos
    expect(arquivos).toEqual({ [A]: ent() })
  })

  it('fileId e versaoRemota saem da listagem de AGORA, não da entrada velha', () => {
    // Um arquivo recriado no Drive com conteúdo idêntico ganha id novo sem que nada tenha
    // mudado: a reconciliação não emite ação, e é só a reconstrução que atualiza o id.
    const arquivos = reconstruir({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc() },
      remoto: { [A]: rem({ fileId: 'f-recriado', versao: 'v7' }) },
    }).arquivos
    expect(arquivos[A]).toEqual(ent({ fileId: 'f-recriado', versaoRemota: 'v7' }))
  })

  it('apagado dos dois lados some do manifesto', () => {
    // A célula `apagado × apagado` da matriz não emite ação nenhuma — não existe verbo
    // `esquecer` em `Acao`. Sob edição incremental esta entrada viveria para sempre e
    // inflaria o denominador do freio de deleção em massa.
    expect(reconstruir({ anterior: manifesto({ arquivos: { [A]: ent() } }) }).arquivos).toEqual({})
  })

  it('lápide remota conta como apagado mesmo com o arquivo ainda no disco', () => {
    // O local PRECISA estar presente aqui: sem ele o caminho cairia fora por falta de lado
    // local e o teste passaria mesmo com a checagem de `removido` removida.
    //
    // Largar a entrada é o lado seguro. O ciclo seguinte vê um arquivo local sem manifesto e
    // manda `subir`; mantê-la faria a matriz ler `igual × apagado` e APAGAR um arquivo que
    // está no disco com base num manifesto que já não descreve o Drive.
    const arquivos = reconstruir({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc() },
      remoto: { [A]: rem({ removido: true }) },
    }).arquivos
    expect(arquivos).toEqual({})
  })

  it('vivo só de um lado não vira entrada', () => {
    expect(reconstruir({ local: { [A]: loc() } }).arquivos).toEqual({})
    expect(reconstruir({ remoto: { [A]: rem() } }).arquivos).toEqual({})
  })
})

describe('caminho com ação concluída — o desfecho é a verdade', () => {
  it('desfecho com entrada grava a entrada nova por cima da velha', () => {
    const nova = ent({ fileId: 'f-novo', hash: 'H1', versaoRemota: 'v1' })
    const arquivos = reconstruir({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc({ hash: 'H1' }) },
      remoto: { [A]: rem() },
      concluidos: { [A]: nova },
    }).arquivos
    expect(arquivos).toEqual({ [A]: nova })
  })

  it('desfecho null tira o caminho, mesmo com o estado vivo ainda nos mapas', () => {
    // É o caso de `apagarRemoto`: a varredura local não tem mais o arquivo, mas a listagem
    // remota — que é de ANTES do ciclo — continua mostrando o que acabou de ser apagado.
    const arquivos = reconstruir({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      remoto: { [A]: rem() },
      concluidos: { [A]: null },
    }).arquivos
    expect(arquivos).toEqual({})
  })
})

describe('caminho com ação que falhou — o manifesto não pode mentir', () => {
  it('mantém a entrada do último sync bem-sucedido', () => {
    // Se gravasse o estado que a ação TERIA produzido, o ciclo seguinte compararia os dois
    // lados contra um manifesto que afirma um estado que nunca existiu, concluiria
    // "igual × igual" e a divergência sumiria de vista para sempre.
    const arquivos = reconstruir({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc({ hash: 'H1' }) },
      remoto: { [A]: rem() },
      falhados: [A],
    }).arquivos
    expect(arquivos).toEqual({ [A]: ent() })
  })

  it('a falha vence o estado vivo: não grava a entrada de repouso', () => {
    // Sem a precedência, este caso gravaria `{ fileId: f-vivo, hash: H1 }` — uma entrada que
    // afirma que os dois lados estão em H1 quando o remoto nunca recebeu o upload.
    const arquivos = reconstruir({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      local: { [A]: loc({ hash: 'H1' }) },
      remoto: { [A]: rem({ fileId: 'f-vivo' }) },
      falhados: [A],
    }).arquivos
    expect(arquivos[A]).toEqual(ent())
  })

  it('preserva a entrada mesmo de um caminho que sumiu dos dois mapas', () => {
    // Contrato da função pura, não estado que o executor produza: `falhados` entra na união de
    // caminhos por si só, para que a preservação não dependa de o caminho ainda aparecer na
    // varredura local ou na listagem remota que o chamador passou.
    const arquivos = reconstruir({
      anterior: manifesto({ arquivos: { [A]: ent() } }),
      falhados: [A],
    }).arquivos
    expect(arquivos).toEqual({ [A]: ent() })
  })

  it('caminho novo que falhou não inventa entrada nenhuma', () => {
    const arquivos = reconstruir({
      local: { [A]: loc() },
      falhados: [A],
    }).arquivos
    expect(arquivos).toEqual({})
  })

  it('uma falha não contamina os outros caminhos', () => {
    const arquivos = reconstruir({
      anterior: manifesto({ arquivos: { [A]: ent(), 'b.json': ent() } }),
      local: { [A]: loc({ hash: 'H1' }), 'b.json': loc({ hash: 'H1' }) },
      remoto: { [A]: rem(), 'b.json': rem() },
      concluidos: { 'b.json': ent({ hash: 'H1', versaoRemota: 'v1' }) },
      falhados: [A],
    }).arquivos
    expect(arquivos).toEqual({ [A]: ent(), 'b.json': ent({ hash: 'H1', versaoRemota: 'v1' }) })
  })
})

describe('o resto do manifesto', () => {
  it('a identidade do cofre e o startPageToken atravessam intactos', () => {
    const anterior = manifesto({ arquivos: { [A]: ent() } })
    const novo = reconstruir({ anterior, local: { [A]: loc() }, remoto: { [A]: rem() } })
    expect(novo).toEqual({ ...anterior, ultimoSync: AGORA, pastas: {} })
  })

  it('pastas é reescrito pelo que se sabe agora, não herdado do manifesto velho', () => {
    // Herdar traria de volta ids de pastas que podem já ter ido para a lixeira do Drive — e
    // enviar para uma pasta na lixeira deposita o arquivo lá dentro sem erro nenhum.
    const novo = reconstruir({ pastas: { campanhas: 'p1' } })
    expect(novo.pastas).toEqual({ campanhas: 'p1' })
  })

  it('as chaves saem ordenadas, para o mesmo estado gerar sempre o mesmo JSON', () => {
    const novo = reconstruir({
      local: { 'z.json': loc(), 'a.json': loc(), 'm.json': loc() },
      remoto: { 'z.json': rem(), 'a.json': rem(), 'm.json': rem() },
      pastas: { z: 'pz', a: 'pa' },
    })
    expect(Object.keys(novo.arquivos)).toEqual(['a.json', 'm.json', 'z.json'])
    expect(Object.keys(novo.pastas)).toEqual(['a', 'z'])
  })

  it('um arquivo chamado __proto__ vira entrada de verdade, e não some no protótipo', () => {
    // A chave computada é obrigatória aqui: `{ __proto__: x }` num literal define o PROTÓTIPO
    // do objeto em vez de uma propriedade, e o teste passaria sem testar nada.
    const novo = reconstruir({ local: { ['__proto__']: loc() }, remoto: { ['__proto__']: rem() } })
    expect(Object.keys(novo.arquivos)).toEqual(['__proto__'])
  })
})

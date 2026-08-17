import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../state/store'
import { VaultRepo } from '../lib/vaultRepo'
import type { Cenario, PastaCenarioNode, VaultTree, Vinculo } from '../lib/types'

/**
 * Cobre os defeitos 2 e 4 do relatório de auditoria da Barra de Localização:
 * - defeito 2: vínculos (e salas de mapa) que apontavam para o cenário absorvido não
 *   podem ficar "quebrados" — o conteúdo migrou pro destino, a relação tem que seguir junto.
 * - defeito 4: `absorverCenarioComoVersao` precisa da MESMA guarda de baixo nível que
 *   `moverCenario` já tem, e não pode confiar só na UI filtrar o próprio cenário/descendentes.
 */

function cenario(id: string, nome: string): Cenario {
  return {
    id, nome, personagens: [],
    versoes: [{ id: `${id}-v1`, nome: 'Base', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [] }],
    versaoAtivaId: `${id}-v1`, criadoEm: 'x', modificadoEm: 'y',
  }
}

function vinc(id: string, over: Partial<Vinculo>): Vinculo {
  return { id, deTipo: 'personagem', deId: 'p1', paraTipo: 'cenario', paraId: 'origem', tipo: 'mora em', notas: '', criadoEm: 'x', ...over }
}

/** Árvore mínima em que `origem` é filho de `raiz`, `destino` é irmão dele — nenhum é descendente do outro. */
function arvore(): VaultTree {
  const raiz: PastaCenarioNode = {
    slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [],
    cenarios: [
      { id: 'origem', slug: 'origem', nome: 'Origem', caminho: 'cenarios/origem', filhos: [] },
      { id: 'destino', slug: 'destino', nome: 'Destino', caminho: 'cenarios/destino', filhos: [] },
    ],
  }
  return {
    campanhas: [], canvasesSoltos: [], mapasSoltos: [],
    personagensSoltos: { slug: 'personagens-soltos', nome: 'personagens-soltos', caminho: 'personagens-soltos', subpastas: [], personagens: [] },
    cenarios: raiz,
    itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
  }
}

/** Repo de mentira: grava em memória e registra as chamadas de mais alto nível (para checar ordem/participação). */
function repoEspiao() {
  const cenariosGravados: Record<string, Cenario> = {}
  let vinculosGravados: Vinculo[] | null = null
  const movidosParaLixeira: string[] = []
  const chamadasRedirecionarSalas: { origemId: string; destinoId: string }[] = []
  const repo = {
    async salvarCenario(caminho: string, c: Cenario) {
      cenariosGravados[caminho] = c
    },
    async salvarVinculos(lista: Vinculo[]) {
      vinculosGravados = lista
    },
    async redirecionarSalasDeCenario(_tree: VaultTree, origemId: string, destinoId: string) {
      chamadasRedirecionarSalas.push({ origemId, destinoId })
      return 0
    },
    async moverCenarioParaLixeira(dir: string) {
      movidosParaLixeira.push(dir)
      return 'lixeira-id'
    },
    async montarArvore() {
      return arvore()
    },
    async lerCenario(dir: string) {
      // devolve o cenário atualmente em cache pelo dir — usado por carregarCenarios()
      const id = dir.split('/').pop()!
      return cenariosGravados[`${dir}`] ?? cenario(id, id === 'destino' ? 'Destino' : 'Origem')
    },
  }
  return { repo: repo as unknown as VaultRepo, cenariosGravados, vinculosGravados: () => vinculosGravados, movidosParaLixeira, chamadasRedirecionarSalas }
}

function calarConsole() {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

beforeEach(() => {
  useApp.setState({
    repo: null, vaultPath: null, cenarios: {}, caminhoCenarioPorId: {}, vinculos: [],
    tree: null, cenarioAbertoId: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('absorverCenarioComoVersao — defeito 2 (vínculos sobrevivem à absorção)', () => {
  it('redireciona deId/paraId da origem para o destino e grava vinculos.json', async () => {
    const { repo, vinculosGravados } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { origem: cenario('origem', 'Origem'), destino: cenario('destino', 'Destino') },
      caminhoCenarioPorId: { origem: 'cenarios/origem', destino: 'cenarios/destino' },
      vinculos: [vinc('v1', { deId: 'p1', paraId: 'origem' }), vinc('v2', { deTipo: 'cenario', deId: 'origem', paraTipo: 'personagem', paraId: 'p2' })],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    const salvos = vinculosGravados()
    expect(salvos).not.toBeNull()
    expect(salvos!.find((v) => v.id === 'v1')?.paraId).toBe('destino')
    // o vínculo em cache do store também já reflete o redirecionamento (sem esperar reload)
    expect(useApp.getState().vinculos.find((v) => v.id === 'v1')?.paraId).toBe('destino')
  })

  it('NÃO grava vinculos.json quando nenhum vínculo tocava a origem (evita escrita à toa)', async () => {
    const { repo, vinculosGravados } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { origem: cenario('origem', 'Origem'), destino: cenario('destino', 'Destino') },
      caminhoCenarioPorId: { origem: 'cenarios/origem', destino: 'cenarios/destino' },
      vinculos: [vinc('v1', { deId: 'p1', paraId: 'outro-cenario' })],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    expect(vinculosGravados()).toBeNull()
  })

  it('descarta o vínculo que viraria auto-relação (origem já tinha vínculo direto com o destino)', async () => {
    const { repo, vinculosGravados } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { origem: cenario('origem', 'Origem'), destino: cenario('destino', 'Destino') },
      caminhoCenarioPorId: { origem: 'cenarios/origem', destino: 'cenarios/destino' },
      vinculos: [vinc('v1', { deTipo: 'cenario', deId: 'origem', paraTipo: 'cenario', paraId: 'destino', tipo: 'perto de' })],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    expect(vinculosGravados()).toEqual([])
    expect(useApp.getState().vinculos).toEqual([])
  })

  it('chama redirecionarSalasDeCenario (salas de mapa) com origem e destino corretos', async () => {
    const { repo, chamadasRedirecionarSalas } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { origem: cenario('origem', 'Origem'), destino: cenario('destino', 'Destino') },
      caminhoCenarioPorId: { origem: 'cenarios/origem', destino: 'cenarios/destino' },
      vinculos: [],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    expect(chamadasRedirecionarSalas).toEqual([{ origemId: 'origem', destinoId: 'destino' }])
  })

  it('mapa corrompido no redirecionamento de salas não derruba a absorção (best-effort)', async () => {
    const { repo, movidosParaLixeira } = repoEspiao()
    ;(repo as unknown as { redirecionarSalasDeCenario: () => Promise<number> }).redirecionarSalasDeCenario = async () => {
      throw new Error('mapa corrompido')
    }
    calarConsole()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { origem: cenario('origem', 'Origem'), destino: cenario('destino', 'Destino') },
      caminhoCenarioPorId: { origem: 'cenarios/origem', destino: 'cenarios/destino' },
      vinculos: [],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    // a absorção seguiu até o fim (origem foi para a lixeira) mesmo com o mapa quebrado
    expect(movidosParaLixeira).toEqual(['cenarios/origem'])
  })
})

describe('absorverCenarioComoVersao — defeito 4 (defesa em profundidade contra auto-absorção)', () => {
  it('chamar com origemId === destinoId é um no-op (não duplica versões, não manda pra lixeira)', async () => {
    const { repo, movidosParaLixeira, cenariosGravados } = repoEspiao()
    const origem = cenario('origem', 'Origem')
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvore(),
      cenarios: { origem },
      caminhoCenarioPorId: { origem: 'cenarios/origem' },
      vinculos: [],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'origem')

    expect(movidosParaLixeira).toEqual([])
    expect(Object.keys(cenariosGravados)).toEqual([])
    // o cache não foi tocado: o cenário continua com uma única versão
    expect(useApp.getState().cenarios.origem.versoes).toHaveLength(1)
  })

  it('a função pura absorverCenario recusa destino === origem mesmo chamada direto (sem passar pela store)', async () => {
    const { absorverCenario } = await import('../lib/localizacaoEntidade')
    const c = cenario('x', 'X')
    expect(() => absorverCenario(c, c, () => 'novo-id')).toThrow()
  })
})

/**
 * RISCO (reauditoria): `moverCenarioParaLixeira` move a PASTA inteira da origem — todo
 * sub-cenário dela vai junto (mesmo `fs.rename` da pasta, ver `lixeiraExecutar.ts`). Mas o
 * redirecionamento de vínculos/salas só recebia `origemId`, nunca os ids dos descendentes.
 * Resultado: um vínculo ou sala-de-mapa que apontava para um SUB-cenário da origem ficava
 * apontando para um id que só existe dentro da lixeira — órfão silencioso, mesmo defeito que
 * a correção anterior alegava ter fechado, com escopo estreito demais.
 *
 * Árvore: `origem` tem um filho `sub` (sub-cenário). `destino` é irmão de `origem`.
 */
function arvoreComSub(): VaultTree {
  const raiz: PastaCenarioNode = {
    slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [],
    cenarios: [
      { id: 'origem', slug: 'origem', nome: 'Origem', caminho: 'cenarios/origem', filhos: [
        { id: 'sub', slug: 'sub', nome: 'Sub', caminho: 'cenarios/origem/sub', filhos: [] },
      ] },
      { id: 'destino', slug: 'destino', nome: 'Destino', caminho: 'cenarios/destino', filhos: [] },
    ],
  }
  return {
    campanhas: [], canvasesSoltos: [], mapasSoltos: [],
    personagensSoltos: { slug: 'personagens-soltos', nome: 'personagens-soltos', caminho: 'personagens-soltos', subpastas: [], personagens: [] },
    cenarios: raiz,
    itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
  }
}

describe('absorverCenarioComoVersao — risco (descendentes não ficam órfãos)', () => {
  it('redireciona vínculo que apontava para um SUB-cenário da origem, não só para a origem', async () => {
    const { repo, vinculosGravados } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvoreComSub(),
      cenarios: { origem: cenario('origem', 'Origem'), destino: cenario('destino', 'Destino') },
      caminhoCenarioPorId: { origem: 'cenarios/origem', destino: 'cenarios/destino' },
      // este vínculo aponta para o SUB-cenário, não para a origem
      vinculos: [vinc('v-sub', { deId: 'p1', paraId: 'sub' })],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    const salvos = vinculosGravados()
    expect(salvos).not.toBeNull()
    // sem o conserto, isto continuaria 'sub' — um id que só existe dentro da lixeira agora
    expect(salvos!.find((v) => v.id === 'v-sub')?.paraId).toBe('destino')
    expect(useApp.getState().vinculos.find((v) => v.id === 'v-sub')?.paraId).toBe('destino')
  })

  it('redireciona sala de mapa do SUB-cenário também (chama redirecionarSalasDeCenario para cada descendente)', async () => {
    const { repo, chamadasRedirecionarSalas } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvoreComSub(),
      cenarios: { origem: cenario('origem', 'Origem'), destino: cenario('destino', 'Destino') },
      caminhoCenarioPorId: { origem: 'cenarios/origem', destino: 'cenarios/destino' },
      vinculos: [],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    // a origem E o sub-cenário são redirecionados pro mesmo destino — nenhum id de
    // descendente fica de fora
    expect(chamadasRedirecionarSalas).toContainEqual({ origemId: 'origem', destinoId: 'destino' })
    expect(chamadasRedirecionarSalas).toContainEqual({ origemId: 'sub', destinoId: 'destino' })
  })

  /**
   * Defeito baixo (reauditoria 3): o conteúdo do SUB-cenário não vira versão de nada — só as
   * versões da origem DIRETA entram no destino (ver `absorverCenario`/`versoesParaAbsorcao`).
   * O vínculo que apontava pro sub some pra lixeira junto com ele; sem a nota, o vínculo
   * redirecionado mentiria em silêncio dizendo que o destino guarda aquele conteúdo.
   */
  it('vínculo de um SUB-cenário ganha nota dizendo que era sobre ELE, não sobre a origem direta', async () => {
    const { repo, vinculosGravados } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvoreComSub(),
      // 'sub' precisa estar no cache pro nome real aparecer na nota (não o fallback pro nome da origem)
      cenarios: { origem: cenario('origem', 'Origem'), sub: cenario('sub', 'Prisão da Torre'), destino: cenario('destino', 'Destino') },
      caminhoCenarioPorId: { origem: 'cenarios/origem', sub: 'cenarios/origem/sub', destino: 'cenarios/destino' },
      vinculos: [
        vinc('v-sub', { deId: 'p1', paraId: 'sub' }),
        vinc('v-origem', { deId: 'p2', paraId: 'origem' }),
      ],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    const salvos = vinculosGravados()!
    // o vínculo do SUB-cenário leva a nota, com o nome do sub-cenário (não "Origem")
    expect(salvos.find((v) => v.id === 'v-sub')?.notas).toBe('(era sobre: Prisão da Torre, fundido no destino)')
    // o vínculo da origem DIRETA não leva nota nenhuma: o conteúdo dela de fato migrou pro destino
    expect(salvos.find((v) => v.id === 'v-origem')?.notas).toBe('')
  })
})

/**
 * Árvore com DOIS sub-cenários (dois cômodos do mesmo castelo absorvido) — o caso real que
 * escondia o defeito. Nenhum teste acima chamava `absorverCenarioComoVersao` com mais de um
 * descendente, então o encadeamento defeituoso (uma chamada de `redirecionarVinculosAbsorcao`
 * POR descendente, em vez de uma chamada única pro lote inteiro) nunca era exercitado.
 */
function arvoreComDoisSubs(): VaultTree {
  const raiz: PastaCenarioNode = {
    slug: 'cenarios', nome: 'cenarios', caminho: 'cenarios', subpastas: [],
    cenarios: [
      { id: 'origem', slug: 'origem', nome: 'Origem', caminho: 'cenarios/origem', filhos: [
        { id: 'subA', slug: 'subA', nome: 'Comodo A', caminho: 'cenarios/origem/subA', filhos: [] },
        { id: 'subB', slug: 'subB', nome: 'Comodo B', caminho: 'cenarios/origem/subB', filhos: [] },
      ] },
      { id: 'destino', slug: 'destino', nome: 'Destino', caminho: 'cenarios/destino', filhos: [] },
    ],
  }
  return {
    campanhas: [], canvasesSoltos: [], mapasSoltos: [],
    personagensSoltos: { slug: 'personagens-soltos', nome: 'personagens-soltos', caminho: 'personagens-soltos', subpastas: [], personagens: [] },
    cenarios: raiz,
    itens: { slug: 'itens', nome: 'itens', caminho: 'itens', subpastas: [], itens: [] },
  }
}

describe('absorverCenarioComoVersao — defeito desta rodada (dois sub-cenários com vínculo colidindo)', () => {
  it('dois cômodos mencionando o mesmo NPC: nenhum vínculo some, as duas notas sobrevivem fundidas', async () => {
    const { repo, vinculosGravados } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvoreComDoisSubs(),
      cenarios: {
        origem: cenario('origem', 'Origem'),
        subA: cenario('subA', 'Comodo A'),
        subB: cenario('subB', 'Comodo B'),
        destino: cenario('destino', 'Destino'),
      },
      caminhoCenarioPorId: {
        origem: 'cenarios/origem', subA: 'cenarios/origem/subA', subB: 'cenarios/origem/subB', destino: 'cenarios/destino',
      },
      // os dois cômodos mencionam o MESMO npc — mesma chave (de,para,tipo) depois do redirect
      vinculos: [
        vinc('v-a', { deTipo: 'cenario', deId: 'subA', paraTipo: 'personagem', paraId: 'npc', tipo: 'menciona' }),
        vinc('v-b', { deTipo: 'cenario', deId: 'subB', paraTipo: 'personagem', paraId: 'npc', tipo: 'menciona' }),
      ],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    const salvos = vinculosGravados()!
    // ANTES do conserto: encadear uma chamada por descendente fazia o vínculo do segundo
    // cômodo (v-b) sumir sem aviso ao colidir com o do primeiro (v-a), já redirecionado numa
    // chamada anterior que a dedupe da segunda chamada não conseguia mais enxergar como "do lote".
    expect(salvos).toHaveLength(1)
    const sobrevivente = salvos[0]
    expect(sobrevivente.deId).toBe('destino')
    expect(sobrevivente.paraId).toBe('npc')
    // vira UMA relação (mesma chave de/para/tipo depois do redirect), mas as notas dos DOIS
    // cômodos sobrevivem juntas — nenhum rastro se perde
    expect(sobrevivente.notas).toBe('(era sobre: Comodo A, fundido no destino) (era sobre: Comodo B, fundido no destino)')
  })

  it('vínculos alheios pré-existentes que já colidiam entre si continuam intactos (regressão anterior não pode voltar)', async () => {
    const { repo, vinculosGravados } = repoEspiao()
    useApp.setState({
      repo, vaultPath: 'C:/cofre', tree: arvoreComDoisSubs(),
      cenarios: {
        origem: cenario('origem', 'Origem'),
        subA: cenario('subA', 'Comodo A'),
        subB: cenario('subB', 'Comodo B'),
        destino: cenario('destino', 'Destino'),
      },
      caminhoCenarioPorId: {
        origem: 'cenarios/origem', subA: 'cenarios/origem/subA', subB: 'cenarios/origem/subB', destino: 'cenarios/destino',
      },
      vinculos: [
        // dois vínculos alheios, sem relação nenhuma com a absorção, que já colidiam entre si
        { id: 'alheio-1', deTipo: 'personagem', deId: 'pX', paraTipo: 'personagem', paraId: 'pY', tipo: 'amigo de', notas: 'primeira cópia', criadoEm: 'a' },
        { id: 'alheio-2', deTipo: 'personagem', deId: 'pX', paraTipo: 'personagem', paraId: 'pY', tipo: 'amigo de', notas: 'segunda cópia (conflito de sync)', criadoEm: 'b' },
        // um vínculo por cômodo só pra a absorção não virar no-op
        vinc('v-a', { deTipo: 'cenario', deId: 'subA', paraTipo: 'personagem', paraId: 'p2', tipo: 'menciona' }),
        vinc('v-b', { deTipo: 'cenario', deId: 'subB', paraTipo: 'personagem', paraId: 'p3', tipo: 'menciona' }),
      ],
    })

    await useApp.getState().absorverCenarioComoVersao('origem', 'destino')

    const salvos = vinculosGravados()!
    expect(salvos.find((v) => v.id === 'alheio-1')).toBeDefined()
    expect(salvos.find((v) => v.id === 'alheio-2')).toBeDefined()
  })
})

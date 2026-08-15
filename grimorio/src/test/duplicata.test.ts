import { describe, it, expect, vi } from 'vitest'
import type { EntradaDeDiretorio, FsBridge } from '../lib/fsBridge'
import { ehCopiaDe, marcarComoCopia, nomeDaCopia, temMarcaDeCopia } from '../lib/sync/conflito'
import { candidatosDeCopia, mesmoConteudoEntidade } from '../lib/sync/duplicata'

/**
 * A assimetria de custo deste módulo manda nos testes: dizer "é duplicata" quando não é DESCARTA
 * conteúdo do usuário, em silêncio; dizer "não é" só deixa arquivo a mais. Por isso o que está
 * coberto aqui com mais cuidado é o falso positivo — inclusive dois casos que a implementação
 * anterior errava de verdade, e que ficam registrados como teste de regressão.
 */

const QUANDO = new Date(2026, 6, 26, 14, 32)
const ASSINATURA = 'PC da Sala'

function personagem(campos: Record<string, unknown>): string {
  return JSON.stringify({ id: 'p-1', nome: 'Gandalf', ...campos }, null, 2)
}

/** Como a cópia fica no disco depois de um ciclo: id novo, nome prefixado. */
function comoNoDisco(bruto: string, idNovo = 'p-copia'): string {
  const marcado = marcarComoCopia(bruto, idNovo)
  if (marcado === null) throw new Error('fixture inválida: marcarComoCopia recusou o conteúdo')
  return marcado
}

describe('ehCopiaDe', () => {
  const original = 'mapas-soltos/castelo.json'

  it('reconhece a primeira cópia', () => {
    expect(ehCopiaDe(original, nomeDaCopia(original, ASSINATURA, QUANDO, 0))).toBe(true)
  })

  /**
   * O caso que a versão anterior nunca testou e que era o mais frágil do desenho dela: a cópia
   * numerada de um ciclo antigo precisa continuar sendo achada nos ciclos seguintes, senão o
   * conflito volta a multiplicar exatamente onde deveria parar.
   */
  it('reconhece as cópias numeradas de ciclos anteriores', () => {
    for (const tentativa of [1, 2, 9]) {
      expect(ehCopiaDe(original, nomeDaCopia(original, ASSINATURA, QUANDO, tentativa))).toBe(true)
    }
  })

  it('reconhece cópia carimbada em qualquer data e por qualquer computador', () => {
    const outra = nomeDaCopia(original, 'Notebook', new Date(2020, 0, 1, 0, 0), 0)
    expect(ehCopiaDe(original, outra)).toBe(true)
  })

  // o nome do computador é do usuário e pode ter parêntese; parar no primeiro `)` deixaria de
  // achar as cópias dele, e o conflito voltaria a duplicar só nessa máquina
  it('aceita assinatura com parêntese', () => {
    expect(ehCopiaDe(original, nomeDaCopia(original, 'PC (casa)', QUANDO, 0))).toBe(true)
  })

  it('não confunde a cópia de OUTRO arquivo de nome parecido', () => {
    const vizinho = nomeDaCopia('mapas-soltos/castelo grande.json', ASSINATURA, QUANDO, 0)
    expect(ehCopiaDe(original, vizinho)).toBe(false)
  })

  it('não aceita arquivo do usuário que só imite o padrão', () => {
    expect(ehCopiaDe(original, 'mapas-soltos/castelo (rascunho).json')).toBe(false)
    expect(ehCopiaDe(original, 'mapas-soltos/castelo (conflito).json')).toBe(false)
    expect(ehCopiaDe(original, 'mapas-soltos/castelo.json')).toBe(false)
  })

  // o temporário do próprio processo mora ao lado da cópia; entrar na lista de candidatos faria
  // o ciclo comparar o perdedor consigo mesmo
  it('não aceita o temporário de trabalho', () => {
    const temp = `${nomeDaCopia(original, ASSINATURA, QUANDO, 0)}.tmp-conflito`
    expect(ehCopiaDe(original, temp)).toBe(false)
  })

  it('não aceita cópia que esteja em outra pasta', () => {
    const forasteiro = nomeDaCopia('outra-pasta/castelo.json', ASSINATURA, QUANDO, 0)
    expect(ehCopiaDe(original, forasteiro)).toBe(false)
  })

  // cenário é a única política cuja entidade é a PASTA: a cópia é pasta irmã, não arquivo irmão
  it('trata a cópia de cenário como pasta irmã', () => {
    const cen = 'cenarios/taverna/cenario.json'
    expect(ehCopiaDe(cen, nomeDaCopia(cen, ASSINATURA, QUANDO, 0))).toBe(true)
    expect(ehCopiaDe(cen, 'cenarios/taverna/cenario (conflito — PC 26-07 14h32).json')).toBe(false)
  })
})

/**
 * Esta função AUTORIZA uma exclusão irreversível: é ela que decide se o botão "Descartar" do
 * painel Nuvem aparece para um item. Um `true` indevido põe um botão de apagar em cima de uma
 * entidade real e única do usuário. Por isso ela é testada direto aqui, e não só pelo painel.
 */
describe('temMarcaDeCopia', () => {
  it('reconhece o que `nomeDaCopia` gerou, em todas as formas', () => {
    const casos = [
      'mapas-soltos/castelo.json',
      'personagens-soltos/gandalf.json',
      'cenarios/taverna/cenario.json',
      'campanhas/goa/assets/mapa.png',
    ]
    for (const original of casos) {
      for (const tentativa of [0, 1, 3]) {
        expect(temMarcaDeCopia(nomeDaCopia(original, ASSINATURA, QUANDO, tentativa))).toBe(true)
      }
    }
  })

  /**
   * O caso que motivou a função existir. O prefixo `(conflito) ` é texto que qualquer um digita;
   * a marca de verdade (travessão em-dash + assinatura + carimbo) só sai de `nomeDaCopia`. Um
   * mestre que batize uma sessão de "(conflito) na Ilha dos Piratas" não pode ganhar um botão
   * que apaga a única cópia dela.
   */
  it('recusa nome escrito por gente, mesmo imitando o padrão', () => {
    const inventados = [
      'cenarios/conflito-na-ilha-dos-piratas/cenario.json',
      'mapas-soltos/castelo (conflito).json',
      'mapas-soltos/castelo (conflito) 2.json',
      'mapas-soltos/castelo (conflito - PC 26-07 14h32).json', // hífen comum, não em-dash
      'mapas-soltos/castelo (conflito — ).json',               // sem assinatura nem carimbo
      'mapas-soltos/(conflito) castelo.json',                  // prefixo, que é só rótulo de tela
      'mapas-soltos/castelo.json',
      '',
    ]
    for (const caminho of inventados) {
      expect(temMarcaDeCopia(caminho), caminho).toBe(false)
    }
  })

  // no cenário a entidade é a PASTA, então a marca fica no nome dela — olhar só o `cenario.json`
  // devolveria `false` para toda cópia de cenário, e nenhuma apareceria no painel
  it('acha a marca no nome da pasta quando a entidade é pasta', () => {
    const copia = nomeDaCopia('cenarios/taverna/cenario.json', ASSINATURA, QUANDO, 0)
    expect(copia.endsWith('/cenario.json')).toBe(true)
    expect(temMarcaDeCopia(copia)).toBe(true)
    // o mesmo arquivo numa pasta sem marca continua sendo entidade normal
    expect(temMarcaDeCopia('cenarios/taverna/cenario.json')).toBe(false)
  })
})

describe('mesmoConteudoEntidade', () => {
  it('reconhece o mesmo perdedor já preservado', () => {
    const bruto = personagem({ resumo: 'mago cinzento' })
    expect(mesmoConteudoEntidade(bruto, comoNoDisco(bruto))).toBe(true)
  })

  it('não confunde conteúdos diferentes', () => {
    const bruto = personagem({ resumo: 'mago cinzento' })
    const outro = personagem({ resumo: 'mago BRANCO' })
    expect(mesmoConteudoEntidade(bruto, comoNoDisco(outro))).toBe(false)
  })

  /**
   * Regressão do falso positivo confirmado por revisão. `marcarComoCopia` só prefixa a versão
   * ATIVA cujo nome espelha o de topo; a implementação anterior desprefixava TODAS as versões,
   * então duas entidades cujas versões não-ativas tinham nomes genuinamente diferentes
   * comparavam iguais — e o perdedor era descartado sem desfazer.
   */
  it('vê diferença em versão NÃO ativa', () => {
    const base = { id: 'p-1', nome: 'Gandalf', versaoAtivaId: 'v1' }
    const bruto = JSON.stringify({
      ...base,
      versoes: [
        { id: 'v1', nome: 'Gandalf', resumo: 'r1' },
        { id: 'v2', nome: '(conflito) Gandalf Cinzento', resumo: 'r2' },
      ],
    }, null, 2)
    const existente = JSON.stringify({
      ...base,
      id: 'p-copia',
      versoes: [
        { id: 'v1', nome: '(conflito) Gandalf', resumo: 'r1' },
        { id: 'v2', nome: 'Gandalf Cinzento', resumo: 'r2' },
      ],
    }, null, 2)
    expect(mesmoConteudoEntidade(bruto, existente)).toBe(false)
  })

  /**
   * Nome autoral que começa com o marcador do sistema — "(conflito) Vilão" é nome plausível num
   * RPG. Aqui a resposta É `true`, e isso está CERTO, ao contrário do que parece.
   *
   * A comparação não pergunta "os originais são o mesmo"; pergunta "a cópia a gravar já está
   * gravada". Como `prefixar` é idempotente de propósito, um original já chamado
   * "(conflito) Vilão" e um chamado "Vilão" produzem cópias byte a byte IGUAIS. Não gravar a
   * segunda não perde conteúdo nenhum: ele está inteiro na primeira. O que se perde é saber de
   * qual original ela veio — informação que a cópia nunca registrou.
   *
   * É por isso que esta colisão é aceitável e a da implementação anterior não era: lá o colapso
   * atingia nomes ARBITRARIAMENTE diferentes; aqui, só arquivos idênticos.
   */
  it('colapsa originais que produziriam a MESMA cópia, e só esses', () => {
    const bruto = personagem({ nome: '(conflito) Vilão', resumo: 'igual' })
    const existente = comoNoDisco(personagem({ nome: 'Vilão', resumo: 'igual' }))
    expect(mesmoConteudoEntidade(bruto, existente)).toBe(true)
    expect(marcarComoCopia(bruto, 'p-copia')).toBe(existente)

    // basta um campo divergir para deixar de colapsar — o nome não é o critério, o conteúdo é
    const divergente = personagem({ nome: '(conflito) Vilão', resumo: 'DIFERENTE' })
    expect(mesmoConteudoEntidade(divergente, existente)).toBe(false)
  })

  it('conteúdo ilegível nunca é igual a nada', () => {
    const bruto = personagem({ resumo: 'x' })
    expect(mesmoConteudoEntidade('{ nao é json', comoNoDisco(bruto))).toBe(false)
    expect(mesmoConteudoEntidade(bruto, 'tambem nao é json')).toBe(false)
    expect(mesmoConteudoEntidade('[]', '[]')).toBe(false)
  })

  it('entidade sem id não é comparável', () => {
    const semId = JSON.stringify({ nome: 'Gandalf' }, null, 2)
    expect(mesmoConteudoEntidade(semId, semId)).toBe(false)
  })
})

describe('candidatosDeCopia', () => {
  /**
   * `listDir` lança a mensagem REAL do Windows em português quando a pasta não existe — capturada
   * de `std::fs::read_dir` via a ponte `list_dir` (`src-tauri/src/lib.rs`). Está aqui de
   * propósito: uma versão anterior distinguia "não existe" de "erro de verdade" por regex nessa
   * mensagem, e o padrão procurava "não encontrad" enquanto o Windows diz "não PODE encontrar".
   * O teste da época passava porque fabricava a mensagem em inglês, e o bug viveu assim.
   */
  const ERRO_REAL_WINDOWS = 'O sistema não pode encontrar o caminho especificado. (os error 3)'

  function fsCom(entradas: Record<string, EntradaDeDiretorio[]>): FsBridge {
    return {
      exists: async (caminho: string) => entradas[caminho] !== undefined,
      listDir: async (caminho: string) => {
        const achado = entradas[caminho]
        if (achado === undefined) throw new Error(ERRO_REAL_WINDOWS)
        return achado
      },
    } as unknown as FsBridge
  }
  const arquivo = (name: string): EntradaDeDiretorio => ({ name, isDir: false, size: 1, mtime: 1 })

  const loc = (fs: FsBridge) => ({ fs, abs: (rel: string) => `/cofre/${rel}`.replace(/\/$/, '') })

  it('acha a cópia numerada semeada por um ciclo anterior', async () => {
    const original = 'mapas-soltos/castelo.json'
    const primeira = nomeDaCopia(original, ASSINATURA, QUANDO, 0)
    const segunda = nomeDaCopia(original, ASSINATURA, QUANDO, 1)
    const fs = fsCom({
      '/cofre/mapas-soltos': [
        arquivo('castelo.json'),
        arquivo(primeira.split('/')[1]),
        arquivo(segunda.split('/')[1]),
        arquivo('taverna.json'),
      ],
    })
    await expect(candidatosDeCopia(loc(fs), original)).resolves.toEqual([primeira, segunda])
  })

  /**
   * Primeiro conflito deste arquivo: a pasta pode nem existir, e é o caso mais comum do sistema.
   * O `fsCom` lança aqui a mensagem localizada de verdade — se a distinção voltar a depender do
   * texto do erro, este teste fica vermelho em vez de o usuário receber um aviso falso por ciclo.
   */
  it('pasta ausente devolve lista vazia sem barulho, em qualquer idioma do sistema', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(candidatosDeCopia(loc(fsCom({})), 'mapas-soltos/castelo.json')).resolves.toEqual([])
    expect(aviso).not.toHaveBeenCalled()
    aviso.mockRestore()
  })

  // falha que NÃO é "pasta não existe" avisa: sem isso, bug de varredura tem a mesma cara do
  // caso feliz, e o conflito volta a duplicar em silêncio
  it('falha inesperada de leitura avisa antes de seguir', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fs = {
      exists: async () => true,
      listDir: async () => { throw new Error('EACCES: permissao negada') },
    } as unknown as FsBridge
    await expect(candidatosDeCopia(loc(fs), 'mapas-soltos/castelo.json')).resolves.toEqual([])
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })
})

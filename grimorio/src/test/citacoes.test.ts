import { describe, expect, it } from 'vitest'
import { apurarCitacoes, citacaoUnica, contarCitacoes, quemCita } from '../lib/organizarImagens/citacoes'
import { criarFakeFs } from './fakeFs'
import { RAIZ, gravarImagem, gravarJson, mapa, pagina, personagem, versaoPersonagem } from './cofreImagens'

/**
 * A checagem única de citação: nenhum arquivo de imagem é sobrescrito nem apagado enquanto outra
 * ficha, versão ou nota ainda o cita. Quem troca retrato, remove da galeria, organiza e desfaz
 * pergunta TODOS a esta mesma função.
 */

const RETRATO = 'imagens/personagens/Bruce/retrato-a3f9.png'

describe('contarCitacoes — dentro de um valor em memória', () => {
  it('conta string igual ao caminho (sem caixa) e data-rel de HTML; nunca pedaço de string', () => {
    const valor = {
      retrato: RETRATO,
      outra: { retrato: RETRATO.toUpperCase() },
      imagens: [{ rel: `${RETRATO}.bak` }],
      descricao: `<p>x</p><img data-rel="${RETRATO}">`,
    }
    expect(contarCitacoes(valor, RETRATO)).toBe(3)
  })

  it('versão clonada (mesmo retrato nas duas) conta duas', () => {
    const p = personagem('p1', [versaoPersonagem('v1', 'Dia', RETRATO), versaoPersonagem('v2', 'Noite', RETRATO)], 'v2')
    expect(contarCitacoes(p, RETRATO)).toBe(2)
  })
})

describe('quemCita — arquivos do cofre', () => {
  it('acha ficha, mapa, nota e lixeira; ignora o que for pedido', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, RETRATO, 'r')
    await gravarJson(fs, 'personagens-soltos/bruce.json', personagem('p1', [versaoPersonagem('v1', 'Bruce', RETRATO)], 'v1'))
    await gravarJson(fs, 'mapas-soltos/m.json', mapa('m1', 'M', [{ id: 'a', rel: RETRATO, name: 'r.png' }]))
    await gravarJson(fs, 'mapas-soltos/m.notas/p.json', pagina('n1', 'P', `<img data-rel="${RETRATO}">`))
    await gravarJson(fs, '.lixeira/e1/velho.json', { retrato: RETRATO })
    await gravarJson(fs, 'itens/outro.json', { retrato: 'imagens/itens/Outro.png' })

    const citam = await quemCita(RAIZ, fs, [RETRATO], ['personagens-soltos/bruce.json'])
    expect(citam.get(RETRATO)?.sort()).toEqual(['.lixeira/e1/velho.json', 'mapas-soltos/m.json', 'mapas-soltos/m.notas/p.json'])
  })

  it('JSON ilegível que tem o caminho no texto conta como citação (na dúvida, cita)', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await fs.writeTextAtomic(`${RAIZ}/quebrado.json`, `{ "retrato": "${RETRATO}", `)
    expect((await quemCita(RAIZ, fs, [RETRATO])).get(RETRATO)).toEqual(['quebrado.json'])
  })

  it('JSON que não dá para ler (travado, sem permissão) conta como citação de tudo, e não derruba a checagem', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, RETRATO, 'r')
    await gravarJson(fs, 'personagens-soltos/travado.json', { retrato: 'imagens/itens/Outro.png' })
    await gravarJson(fs, 'itens/a.json', { retrato: 'imagens/itens/A.png' })
    const fsTravado = {
      ...fs,
      readText: async (p: string) => {
        if (p.endsWith('travado.json')) throw new Error('EBUSY: arquivo em uso')
        return fs.readText(p)
      },
    }
    const citam = await quemCita(RAIZ, fsTravado, [RETRATO, 'imagens/itens/A.png'])
    expect(citam.get(RETRATO)).toEqual(['personagens-soltos/travado.json'])
    expect(citam.get('imagens/itens/A.png')?.sort()).toEqual(['itens/a.json', 'personagens-soltos/travado.json'])
    expect(await citacaoUnica(RETRATO, { raiz: RAIZ, fs: fsTravado })).toBe(false)
  })

  it('imagem que ninguém cita volta com lista vazia', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarJson(fs, 'itens/a.json', { retrato: 'imagens/itens/A.png' })
    expect((await quemCita(RAIZ, fs, [RETRATO])).get(RETRATO)).toEqual([])
  })
})

/**
 * A mesma leitura de `quemCita`, sem decidir pela dúvida: quem tem uma terceira saída além de apagar
 * e manter (o sync pode adiar) recebe o ilegível à parte.
 */
describe('apurarCitacoes — quem cita, com o ilegível à parte', () => {
  it('o .json que não deu para ler vem em `ilegiveis`, e não como citação de tudo', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarJson(fs, 'personagens-soltos/travado.json', { retrato: RETRATO })
    await gravarJson(fs, 'itens/a.json', { retrato: 'imagens/itens/A.png' })
    const fsTravado = {
      ...fs,
      readText: async (p: string) => {
        if (p.endsWith('travado.json')) throw new Error('EBUSY: arquivo em uso')
        return fs.readText(p)
      },
    }

    const apuradas = await apurarCitacoes(RAIZ, fsTravado, [RETRATO, 'imagens/itens/A.png'])

    expect(apuradas.citantes.get(RETRATO)).toEqual([])
    expect(apuradas.citantes.get('imagens/itens/A.png')).toEqual(['itens/a.json'])
    expect(apuradas.ilegiveis).toEqual(['personagens-soltos/travado.json'])
  })

  it('com a lista de arquivos na mão não lista o disco, e da lista só vale o que listarCofre veria', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarJson(fs, 'personagens-soltos/bruce.json', { retrato: RETRATO })
    await gravarJson(fs, '.lixeira/e1/velho.json', { retrato: RETRATO })
    await gravarJson(fs, '.oculta/x.json', { retrato: RETRATO })
    await gravarJson(fs, 'mapas/.lixeira/y.json', { retrato: RETRATO })
    await gravarJson(fs, 'fora-da-lista.json', { retrato: RETRATO })
    const semListar = {
      ...fs,
      listDir: async () => {
        throw new Error('com a lista na mão não era para listar')
      },
    }

    const apuradas = await apurarCitacoes(RAIZ, semListar, [RETRATO], [
      'personagens-soltos/bruce.json',
      '.lixeira/e1/velho.json',
      '.oculta/x.json',
      'mapas/.lixeira/y.json',
      'personagens-soltos/bruce.json',
      'imagens/r.png',
    ])

    // a lixeira só conta na raiz, pasta com ponto fica de fora, a repetição não duplica e a imagem não é lida
    expect(apuradas.citantes.get(RETRATO)).toEqual(['.lixeira/e1/velho.json', 'personagens-soltos/bruce.json'])
    expect(apuradas.ilegiveis).toEqual([])
  })

  it('arquivo da lista que não está mais no disco é ilegível: pode ter mudado de caminho, e o novo ninguém leu', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    const apuradas = await apurarCitacoes(RAIZ, fs, [RETRATO], ['personagens-soltos/sumiu.json'])
    expect(apuradas.citantes.get(RETRATO)).toEqual([])
    expect(apuradas.ilegiveis).toEqual(['personagens-soltos/sumiu.json'])
  })

  it('sem imagem perguntada não toca no disco', async () => {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    const intocado = {
      ...fs,
      listDir: async () => {
        throw new Error('não era para listar')
      },
      readText: async () => {
        throw new Error('não era para ler')
      },
    }
    expect(await apurarCitacoes(RAIZ, intocado, [])).toEqual({ citantes: new Map(), ilegiveis: [] })
  })
})

describe('citacaoUnica — pode sobrescrever ou apagar?', () => {
  async function cofreDoBruce(extra?: (fs: ReturnType<typeof criarFakeFs>) => Promise<void>) {
    const fs = criarFakeFs({ caixa: 'insensivel' })
    await gravarImagem(fs, RETRATO, 'r')
    // o disco ainda tem a ficha de ANTES de clonar a versão: só a memória sabe da "Noite"
    await gravarJson(fs, 'personagens-soltos/bruce.json', personagem('p1', [versaoPersonagem('v1', 'Dia', RETRATO)], 'v1'))
    await extra?.(fs)
    return fs
  }

  it('versão clonada ainda cita (só na memória): NÃO pode', async () => {
    const fs = await cofreDoBruce()
    const emMemoria = personagem('p1', [versaoPersonagem('v1', 'Dia', RETRATO), versaoPersonagem('v2', 'Noite', RETRATO)], 'v2')
    expect(await citacaoUnica(RETRATO, {
      raiz: RAIZ, fs, emMemoria: { valor: emMemoria, arquivo: 'personagens-soltos/bruce.json', permitidas: 1 },
    })).toBe(false)
  })

  it('outro arquivo do cofre cita (card num mapa): NÃO pode', async () => {
    const fs = await cofreDoBruce(async (f) => {
      await gravarJson(f, 'mapas-soltos/m.json', mapa('m1', 'M', [{ id: 'a', rel: RETRATO, name: 'r.png' }]))
    })
    const emMemoria = personagem('p1', [versaoPersonagem('v1', 'Dia', RETRATO)], 'v1')
    expect(await citacaoUnica(RETRATO, {
      raiz: RAIZ, fs, emMemoria: { valor: emMemoria, arquivo: 'personagens-soltos/bruce.json', permitidas: 1 },
    })).toBe(false)
  })

  it('só a citação que está sendo trocada: pode (a ficha dela no disco, possivelmente velha, não conta)', async () => {
    const fs = await cofreDoBruce()
    const emMemoria = personagem('p1', [versaoPersonagem('v1', 'Dia', RETRATO)], 'v1')
    expect(await citacaoUnica(RETRATO, {
      raiz: RAIZ, fs, emMemoria: { valor: emMemoria, arquivo: 'personagens-soltos/bruce.json', permitidas: 1 },
    })).toBe(true)
  })

  it('sem valor em memória, qualquer citação no cofre impede', async () => {
    const fs = await cofreDoBruce()
    expect(await citacaoUnica(RETRATO, { raiz: RAIZ, fs })).toBe(false)
    expect(await citacaoUnica(RETRATO, { raiz: RAIZ, fs, ignorar: ['personagens-soltos/bruce.json'] })).toBe(true)
  })
})

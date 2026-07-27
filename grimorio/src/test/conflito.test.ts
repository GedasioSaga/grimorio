import { describe, expect, it } from 'vitest'
import {
  AUTOR_DESCONHECIDO,
  assinaturaDoPerdedor,
  marcarComoCopia,
  nomeDaCopia,
  politicaDoCaminho,
  unirVinculos,
} from '../lib/sync/conflito'
import type { Vinculo } from '../lib/types'

/**
 * Construído a partir de componentes LOCAIS de propósito: `new Date(2026, 6, 26, 14, 32)` é
 * 26/07 14h32 no fuso de quem roda o teste, seja ele qual for. Um ISO com `Z` faria o carimbo
 * mudar de valor conforme a máquina, e o teste passaria só em UTC-0.
 */
const QUANDO = new Date(2026, 6, 26, 14, 32)
const ASSINATURA = 'PC Casa'
const MARCA = `(conflito — ${ASSINATURA} 26-07 14h32)`

describe('politicaDoCaminho', () => {
  it('trata como entidade todo .json que não é índice nem metadado', () => {
    const entidades = [
      'campanhas/aventura/personagens/gandalf.json',
      'personagens-soltos/viloes/sauron.json',
      'cenarios/reino/cidade-alta/cenario.json',
      'campanhas/aventura/sessoes/sessao-01.json',
      'canvases-soltos/rabisco.json',
      'campanhas/aventura/escrita/lore.notas/capitulo-1.json',
    ]
    for (const caminho of entidades) expect(politicaDoCaminho(caminho)).toBe('entidade')
  })

  it('vinculos.json da raiz é o único caso de união', () => {
    expect(politicaDoCaminho('vinculos.json')).toBe('uniao')
    // um arquivo com o mesmo nome fora da raiz não é o índice do cofre — não pode ser mesclado
    expect(politicaDoCaminho('campanhas/x/vinculos.json')).toBe('entidade')
  })

  it('campanha.json, pasta.json e cofre.json são metadado (vencem por data, sem cópia)', () => {
    expect(politicaDoCaminho('campanhas/aventura/campanha.json')).toBe('metadado')
    expect(politicaDoCaminho('personagens-soltos/viloes/pasta.json')).toBe('metadado')
    expect(politicaDoCaminho('cofre.json')).toBe('metadado')
  })

  it('o que não é .json é binário', () => {
    expect(politicaDoCaminho('campanhas/aventura/assets/retrato.png')).toBe('binario')
    expect(politicaDoCaminho('imagens-cenarios/mapa.JPEG')).toBe('binario')
    expect(politicaDoCaminho('leiame')).toBe('binario')
  })

  it('extensão em caixa alta continua sendo entidade', () => {
    // o Drive é caso-sensível e o Windows não; um .JSON que voltou do Drive é o mesmo arquivo
    expect(politicaDoCaminho('personagens-soltos/gandalf.JSON')).toBe('entidade')
  })
})

describe('assinaturaDoPerdedor', () => {
  it('quando o local vence, quem assina é o computador da versão REMOTA', () => {
    expect(assinaturaDoPerdedor('local', 'PC Casa', 'Notebook')).toBe('Notebook')
  })

  it('quando o remoto vence, quem assina é este computador', () => {
    expect(assinaturaDoPerdedor('remoto', 'PC Casa', 'Notebook')).toBe('PC Casa')
  })

  it('remoto sem appProperties cai no genérico em vez de mentir que a edição veio daqui', () => {
    expect(assinaturaDoPerdedor('local', 'PC Casa', undefined)).toBe(AUTOR_DESCONHECIDO)
    expect(assinaturaDoPerdedor('local', 'PC Casa', '')).toBe(AUTOR_DESCONHECIDO)
  })
})

describe('nomeDaCopia', () => {
  it('põe a marca antes da extensão, na mesma pasta do original', () => {
    expect(nomeDaCopia('campanhas/aventura/personagens/gandalf.json', ASSINATURA, QUANDO, 0))
      .toBe(`campanhas/aventura/personagens/gandalf ${MARCA}.json`)
  })

  it('a partir da segunda tentativa numera, para duas cópias no mesmo minuto não colidirem', () => {
    expect(nomeDaCopia('gandalf.json', ASSINATURA, QUANDO, 1)).toBe(`gandalf ${MARCA} (2).json`)
    expect(nomeDaCopia('gandalf.json', ASSINATURA, QUANDO, 2)).toBe(`gandalf ${MARCA} (3).json`)
  })

  it('mesmo caminho, assinatura e minuto dão sempre o mesmo nome', () => {
    const a = nomeDaCopia('x/y.json', ASSINATURA, new Date(2026, 6, 26, 14, 32, 10), 0)
    const b = nomeDaCopia('x/y.json', ASSINATURA, new Date(2026, 6, 26, 14, 32, 55), 0)
    expect(a).toBe(b)
  })

  it('zero-padding em dia, mês, hora e minuto', () => {
    expect(nomeDaCopia('x.json', 'PC', new Date(2026, 0, 5, 9, 7), 0)).toBe('x (conflito — PC 05-01 09h07).json')
  })

  it('cenário vira PASTA irmã: um cenario.json solto não apareceria na árvore', () => {
    // montarArvoreCenarios reconhece cenário pela presença de cenario.json DENTRO do diretório
    expect(nomeDaCopia('cenarios/reino/cidade-alta/cenario.json', ASSINATURA, QUANDO, 0))
      .toBe(`cenarios/reino/cidade-alta ${MARCA}/cenario.json`)
  })

  it('cenário numerado numera a PASTA, não o arquivo', () => {
    expect(nomeDaCopia('cenarios/cidade/cenario.json', ASSINATURA, QUANDO, 1))
      .toBe(`cenarios/cidade ${MARCA} (2)/cenario.json`)
  })

  it('binário conserva a extensão', () => {
    expect(nomeDaCopia('campanhas/x/assets/retrato.png', ASSINATURA, QUANDO, 0))
      .toBe(`campanhas/x/assets/retrato ${MARCA}.png`)
  })

  it('arquivo na raiz do cofre não ganha barra à toa', () => {
    expect(nomeDaCopia('vinculos.json', ASSINATURA, QUANDO, 0)).toBe(`vinculos ${MARCA}.json`)
  })

  it('arquivo sem extensão recebe a marca no fim', () => {
    expect(nomeDaCopia('pasta/leiame', ASSINATURA, QUANDO, 0)).toBe(`pasta/leiame ${MARCA}`)
  })
})

function analisar(json: string | null): Record<string, any> {
  expect(json).not.toBeNull()
  return JSON.parse(json as string)
}

describe('marcarComoCopia', () => {
  it('troca o id e prefixa o nome', () => {
    const original = JSON.stringify({ id: 'antigo', nome: 'Gandalf', resumo: 'o cinzento' })

    const copia = analisar(marcarComoCopia(original, 'novo-id'))

    // id novo é o coração da política: store.ts indexa personagens[id], e duas entidades com o
    // mesmo id fariam uma sumir da sidebar sem explicação
    expect(copia.id).toBe('novo-id')
    expect(copia.nome).toBe('(conflito) Gandalf')
    expect(copia.resumo).toBe('o cinzento')
  })

  it('página de caderno tem titulo, não nome', () => {
    const copia = analisar(marcarComoCopia(JSON.stringify({ id: 'p1', titulo: 'Capítulo 1', corpo: '<p>x</p>' }), 'n'))

    expect(copia.id).toBe('n')
    expect(copia.titulo).toBe('(conflito) Capítulo 1')
    expect(copia.corpo).toBe('<p>x</p>')
  })

  it('personagem: a forma ativa é prefixada junto, senão o autosave desfaz o rótulo', () => {
    // salvarPersonagem reescreve o `nome` do topo a partir da versão ativa em TODA gravação
    const original = JSON.stringify({
      id: 'p', nome: 'Bruce Banner', versaoAtivaId: 'v1',
      versoes: [{ id: 'v1', nome: 'Bruce Banner' }, { id: 'v2', nome: 'Hulk' }],
    })

    const copia = analisar(marcarComoCopia(original, 'novo'))

    expect(copia.nome).toBe('(conflito) Bruce Banner')
    expect(copia.versoes[0].nome).toBe('(conflito) Bruce Banner')
    expect(copia.versoes[1].nome).toBe('Hulk')
  })

  it('cenário: as versões são formas (Base/Dia/Noite) e não levam prefixo', () => {
    const original = JSON.stringify({
      id: 'c', nome: 'Cidade Alta', versaoAtivaId: 'v1',
      versoes: [{ id: 'v1', nome: 'Base' }, { id: 'v2', nome: 'Noite' }],
    })

    const copia = analisar(marcarComoCopia(original, 'novo'))

    expect(copia.nome).toBe('(conflito) Cidade Alta')
    expect(copia.versoes.map((v: { nome: string }) => v.nome)).toEqual(['Base', 'Noite'])
  })

  it('cópia de cópia não vira "(conflito) (conflito) X"', () => {
    const copia = analisar(marcarComoCopia(JSON.stringify({ id: 'a', nome: '(conflito) Gandalf' }), 'n'))

    expect(copia.nome).toBe('(conflito) Gandalf')
  })

  it('conteúdo sem identidade devolve null — quem chama grava o perdedor tal e qual', () => {
    expect(marcarComoCopia('{ isto não é json', 'n')).toBeNull()
    expect(marcarComoCopia(JSON.stringify({ mensagens: [] }), 'n')).toBeNull()
    expect(marcarComoCopia(JSON.stringify([{ id: 'a' }]), 'n')).toBeNull()
    expect(marcarComoCopia(JSON.stringify({ id: 42 }), 'n')).toBeNull()
    expect(marcarComoCopia('null', 'n')).toBeNull()
  })

  it('entidade sem nome nenhum ainda ganha id novo', () => {
    const copia = analisar(marcarComoCopia(JSON.stringify({ id: 'a', documento: null }), 'n'))

    expect(copia.id).toBe('n')
    expect(copia.nome).toBeUndefined()
  })
})

function vinculo(over: Partial<Vinculo> = {}): Vinculo {
  return {
    id: 'v1', deTipo: 'personagem', deId: 'p1', paraTipo: 'cenario', paraId: 'c1',
    tipo: 'mora em', notas: '', criadoEm: '2026-07-01T00:00:00.000Z', ...over,
  }
}

describe('unirVinculos', () => {
  it('junta os dois lados: nenhum vínculo criado num PC se perde', () => {
    const daqui = { vinculos: [vinculo({ id: 'a', deId: 'p1' })] }
    const deLa = { vinculos: [vinculo({ id: 'b', deId: 'p2' })] }

    const r = unirVinculos(daqui, deLa)

    expect(r.vinculos.map((v) => v.id)).toEqual(['a', 'b'])
  })

  it('dedupe por (deId, paraId, tipo): a mesma relação nos dois lados entra uma vez', () => {
    const mesmo = { deId: 'p1', paraId: 'c1', tipo: 'mora em' }
    const r = unirVinculos(
      { vinculos: [vinculo({ id: 'daqui', ...mesmo })] },
      { vinculos: [vinculo({ id: 'de-la', ...mesmo })] },
    )

    expect(r.vinculos).toHaveLength(1)
    expect(r.vinculos[0].id).toBe('daqui')
  })

  it('mesmo par com tipo diferente são dois vínculos', () => {
    const r = unirVinculos(
      { vinculos: [vinculo({ id: 'a', tipo: 'mora em' })] },
      { vinculos: [vinculo({ id: 'b', tipo: 'frequenta' })] },
    )

    expect(r.vinculos.map((v) => v.tipo)).toEqual(['mora em', 'frequenta'])
  })

  it('lado ausente ou torto vira lista vazia, sem derrubar a união', () => {
    expect(unirVinculos(null, { vinculos: [vinculo()] }).vinculos).toHaveLength(1)
    expect(unirVinculos({ vinculos: [vinculo()] }, { vinculos: 'nada disso' }).vinculos).toHaveLength(1)
    expect(unirVinculos(null, null).vinculos).toEqual([])
  })

  it('a saída é a forma que o cofre grava: { vinculos: [...] }', () => {
    // salvarVinculos escreve JSON.stringify({ vinculos: lista }) — outra forma seria lida como
    // cofre sem vínculo nenhum por normalizarVinculos
    expect(Object.keys(unirVinculos(null, null))).toEqual(['vinculos'])
  })
})

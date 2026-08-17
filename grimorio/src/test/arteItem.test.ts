import { describe, expect, it } from 'vitest'
import { corFundoItem, distanciaCorPerceptual, escolherSimboloItem, formatarContador } from '../lib/arteItem'

describe('escolherSimboloItem', () => {
  it('reconhece palavra-chave com acento (normaliza pra comparar)', () => {
    expect(escolherSimboloItem('Poção de Cura')).toBe('pocao')
  })

  it('reconhece palavra-chave sem acento', () => {
    expect(escolherSimboloItem('Pocao Menor')).toBe('pocao')
  })

  it('é insensível a caixa', () => {
    expect(escolherSimboloItem('CHAVE DA MASMORRA')).toBe('chave')
  })

  it('casa por substring em qualquer posição do nome', () => {
    expect(escolherSimboloItem('Elmo de Ouro Antigo')).toBe('moeda')
  })

  it('cobre pelo menos um exemplo de cada símbolo conhecido', () => {
    expect(escolherSimboloItem('Erva-lua')).toBe('erva')
    expect(escolherSimboloItem('Documento selado')).toBe('documento')
    expect(escolherSimboloItem('Espada longa')).toBe('espada')
    expect(escolherSimboloItem('Adaga envenenada')).toBe('adaga')
    expect(escolherSimboloItem('Machado de guerra')).toBe('machado')
    expect(escolherSimboloItem('Lança élfica')).toBe('lanca')
    expect(escolherSimboloItem('Munição de besta')).toBe('municao')
    expect(escolherSimboloItem('Livro dos mortos')).toBe('livro')
    expect(escolherSimboloItem('Tocha acesa')).toBe('tocha')
    expect(escolherSimboloItem('Ração de viagem')).toBe('comida')
    expect(escolherSimboloItem('Manto do Andarilho')).toBe('vestuario')
  })

  it('reconhece a família de vestuário (manto, capa, túnica, veste, roupa, casaco, robe)', () => {
    expect(escolherSimboloItem('Manto do Andarilho')).toBe('vestuario')
    expect(escolherSimboloItem('Capa Élfica')).toBe('vestuario')
    expect(escolherSimboloItem('Túnica Rasgada')).toBe('vestuario')
    expect(escolherSimboloItem('Veste Ritual')).toBe('vestuario')
    expect(escolherSimboloItem('Roupa de Viagem')).toBe('vestuario')
    expect(escolherSimboloItem('Casaco de Inverno')).toBe('vestuario')
    expect(escolherSimboloItem('Robe do Arquimago')).toBe('vestuario')
  })

  it('não colapsa armas fisicamente diferentes no mesmo símbolo (o defeito relatado)', () => {
    const espada = escolherSimboloItem('Espada Longa de Aço Élfico')
    const adaga = escolherSimboloItem('Adaga Envenenada')
    expect(espada).toBe('espada')
    expect(adaga).toBe('adaga')
    expect(espada).not.toBe(adaga)
  })

  it('faca e punhal caem na família de lâmina curta (adaga), não na de espada', () => {
    expect(escolherSimboloItem('Faca de caça')).toBe('adaga')
    expect(escolherSimboloItem('Punhal ritual')).toBe('adaga')
  })

  it('nome sem nenhuma palavra-chave devolve null', () => {
    expect(escolherSimboloItem('Bugiganga Misteriosa')).toBeNull()
  })

  it('nome vazio devolve null', () => {
    expect(escolherSimboloItem('')).toBeNull()
  })
})

describe('corFundoItem', () => {
  /** Luminância YIQ — mesma fórmula de `corTextoContraste` em `salaMapa.ts`, reimplementada
   * aqui (não importada: este módulo é de item, aquele é de mapa) só pra medir se o fundo
   * ficou escuro o bastante pra não apagar a arte clara (`CREME`/`ACO`) por cima dele. */
  function luminancia(hex: string): number {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return (r * 299 + g * 587 + b * 114) / 1000
  }

  it('é estável: o mesmo id sempre devolve a mesma cor', () => {
    const a = corFundoItem('item-espada-longa-01')
    const b = corFundoItem('item-espada-longa-01')
    expect(a).toBe(b)
  })

  it('devolve hex de 6 dígitos válido', () => {
    expect(corFundoItem('qualquer-id')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('não depende do nome nem de posição na lista — é função pura só do id', () => {
    // a assinatura só recebe `id`: não há como o resultado variar com o que existe ao redor
    // (nome do item, ordem de inserção, quantos outros itens o cofre tem).
    expect(corFundoItem('id-espada-longa')).toBe(corFundoItem('id-espada-longa'))
  })

  // A "mesma mancha de longe" (o defeito relatado: RGB(61,108,85) × RGB(61,108,75), a 10
  // pontos num canal só) é a distância pequena-mas-não-zero — dois itens que TECNICAMENTE
  // têm cores diferentes, mas que o olho não separa. `distanciaCorPerceptual` mede isso
  // (fórmula "redmean"); o par relatado media ~16.6 nessa escala. `LIMIAR` fica bem acima,
  // com folga, pra qualquer par "quase igual" ser pego.
  const LIMIAR_DISTINCAO_MINIMA = 50

  it('a cor de todo item vem de uma paleta fixa e finita — não de um matiz contínuo', () => {
    // matiz contínuo (`hash % 360`) é o que permitia dois itens caírem a poucos graus um do
    // outro. Paleta fixa elimina essa faixa "quase igual": só sobra "idêntico" ou "≥ 60°".
    const cores = new Set(
      Array.from({ length: 300 }, (_, i) => corFundoItem(`item-variado-${i}-${i % 7}-${i * 13}`)),
    )
    expect(cores.size).toBeLessThanOrEqual(6)
  })

  it('PROPRIEDADE: qualquer par de cores da paleta é idêntico ou claramente distinto — nunca "quase igual"', () => {
    // é a garantia estrutural que o critério pede: não depende de qual item cai em qual
    // cor (sorte de hash), só da paleta em si. Testar a paleta inteira cobre todo par
    // possível de uma vez, pra qualquer cofre, com qualquer quantidade de itens.
    const paleta = Array.from(new Set(Array.from({ length: 600 }, (_, i) => corFundoItem(`sonda-${i}`))))
    expect(paleta.length).toBeGreaterThan(1) // sanity: a sonda realmente bateu em mais de uma cor
    for (let i = 0; i < paleta.length; i++) {
      for (let j = i + 1; j < paleta.length; j++) {
        const distancia = distanciaCorPerceptual(paleta[i], paleta[j])
        expect(distancia).toBeGreaterThanOrEqual(LIMIAR_DISTINCAO_MINIMA)
      }
    }
  })

  it('PROPRIEDADE: num cofre grande e variado, todo par de itens é idêntico ou claramente distinto', () => {
    // conjunto grande (500 ids, nomes/formatos variados — não escolhidos a dedo) simulando
    // um cofre cheio. Pra cada par: mesma cor exata, ou distância acima do limiar. Nunca o
    // meio-termo que causou o defeito.
    const nomes = ['Poção', 'Manto', 'Espada', 'Chave', 'Moeda', 'Livro', 'Tocha', 'Adaga', 'Comida', 'Erva']
    const ids = Array.from({ length: 500 }, (_, i) => `${nomes[i % nomes.length]}-${i}-${(i * 977) % 9973}`)
    const cores = ids.map(corFundoItem)
    for (let i = 0; i < cores.length; i++) {
      for (let j = i + 1; j < cores.length; j++) {
        if (cores[i] === cores[j]) continue
        expect(distanciaCorPerceptual(cores[i], cores[j])).toBeGreaterThanOrEqual(LIMIAR_DISTINCAO_MINIMA)
      }
    }
  })

  it('fundo sai escuro o bastante pra arte clara (CREME/ACO) não sumir em cima dele', () => {
    const ids = ['a', 'b', 'c', 'espada', 'adaga', 'pocao-de-cura', 'chave-mestra', 'tocha-acesa']
    for (const id of ids) {
      expect(luminancia(corFundoItem(id))).toBeLessThan(150)
    }
  })
})

describe('formatarContador', () => {
  it('item único (qtd ausente) não ganha contador', () => {
    expect(formatarContador(undefined)).toBeNull()
  })

  it('qtd >= 2 vira texto', () => {
    expect(formatarContador(2)).toBe('2')
    expect(formatarContador(48)).toBe('48')
  })

  it('satura em "999+" acima do máximo', () => {
    expect(formatarContador(1000)).toBe('999+')
    expect(formatarContador(999)).toBe('999')
  })

  it('entrada inválida (NaN, <2) não ganha contador', () => {
    expect(formatarContador(Number.NaN)).toBeNull()
    expect(formatarContador(1)).toBeNull()
    expect(formatarContador(0)).toBeNull()
  })
})

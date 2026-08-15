import { describe, it, expect } from 'vitest'
import {
  promptDescreverCenarioCorrido,
  promptDescreverCenarioTopicos,
  promptDescreverItem,
  promptDescreverPersonagem,
  promptEstruturar,
  promptMelhorar,
  promptVersao,
  REGRA_MARCADORES,
  SYSTEM_ESCRITOR,
} from '../lib/promptsIA'

describe('promptVersao', () => {
  it('curta menciona a aba e o formato curto', () => {
    const p = promptVersao('História', 'curta')
    expect(p).toContain('"História"')
    expect(p).toMatch(/CURTA/)
  })
  it('longa menciona parágrafos', () => {
    expect(promptVersao('Descrição', 'longa')).toMatch(/LONGA|parágrafos/)
  })
  it('pede só o texto, sem título/preâmbulo', () => {
    expect(promptVersao('Eventos', 'curta')).toMatch(/sem título/i)
  })
})

describe('promptMelhorar', () => {
  it('menciona a aba e manter os fatos', () => {
    const p = promptMelhorar('Eventos')
    expect(p).toContain('"Eventos"')
    expect(p).toMatch(/fatos|mantend/i)
  })
})

describe('promptEstruturar', () => {
  it('pede reorganização em Markdown mantendo o sentido', () => {
    const p = promptEstruturar()
    expect(p).toMatch(/reorganiz|estrutur/i)
    expect(p).toMatch(/markdown/i)
    expect(p).toMatch(/sentido|fatos/i)
  })
  it('não pede preâmbulo', () => {
    expect(promptEstruturar()).toMatch(/sem preâmbulo|só/i)
  })
})

describe('SYSTEM_ESCRITOR', () => {
  it('é persona de escrita/worldbuilding em PT-BR', () => {
    expect(SYSTEM_ESCRITOR).toMatch(/escrit|worldbuilding|mundo/i)
    expect(SYSTEM_ESCRITOR).toMatch(/português|PT-BR/i)
  })
  it('exige coerência com o contexto', () => {
    expect(SYSTEM_ESCRITOR).toMatch(/coer|contradiga|contexto/i)
  })
  /** Tabela e bloco de código não têm nó no StarterKit: chegariam à página como texto cru. */
  it('proíbe a marcação que o editor não representa', () => {
    expect(SYSTEM_ESCRITOR).toMatch(/tabela/i)
    expect(SYSTEM_ESCRITOR).toMatch(/código/i)
  })
})

/** Vale para toda descrição de entidade, nas duas fontes. */
const TODAS_AS_DESCRICOES = [
  ['personagem', promptDescreverPersonagem],
  ['cenário em tópicos', promptDescreverCenarioTopicos],
  ['cenário corrido', promptDescreverCenarioCorrido],
  ['item', promptDescreverItem],
] as const

/** As que saem em lista; a prosa corrida vive de emendar fatos e não entra aqui. */
const DESCRICOES_EM_LISTA = [
  ['personagem', promptDescreverPersonagem],
  ['cenário em tópicos', promptDescreverCenarioTopicos],
  ['item', promptDescreverItem],
] as const

describe('descrições em lista — um fato por tópico', () => {
  /**
   * Gap da rodada 2 do gauntlet: exigir o fato da ficha fez o modelo grudá-lo no tópico
   * anterior ("Mofo denso: a cripta está fechada desde a peste"). Dois fatos numa linha
   * viram explicação, e explicação é a conclusão pronta que o mestre não quer.
   */
  for (const [nome, montar] of DESCRICOES_EM_LISTA) {
    it(`${nome} proíbe colar dois fatos na mesma linha`, () => {
      expect(montar('imagem')).toMatch(/Cada tópico carrega UM fato só/i)
      expect(montar('ficha')).toMatch(/dois-pontos ou travessão/i)
    })
  }

  it('a prosa corrida NÃO recebe essa regra — ela emenda fatos de propósito', () => {
    expect(promptDescreverCenarioCorrido('imagem')).not.toMatch(/Cada tópico carrega UM fato/i)
  })
})

describe('descrições de entidade — regras comuns', () => {
  for (const [nome, montar] of TODAS_AS_DESCRICOES) {
    /** O defeito central: entregar a leitura pronta da cena rouba a narração do mestre. */
    it(`${nome} barra sensação e conclusão pronta`, () => {
      for (const fonte of ['imagem', 'ficha'] as const) {
        expect(montar(fonte)).toMatch(/aconchegante/i)
        expect(montar(fonte)).toMatch(/sensação|conclusão/i)
      }
    })

    it(`${nome} pede o concreto sobre a categoria`, () => {
      expect(montar('imagem')).toMatch(/não a categoria/i)
    })

    it(`${nome} não pede preâmbulo`, () => {
      expect(montar('imagem')).toMatch(/sem preâmbulo|sem título/i)
    })

    /**
     * A regra de fidelidade inverte com a fonte, e é o ponto onde um modelo fraco erra feio:
     * mandar "observe a imagem" sem imagem faz ele descrever um retrato que não existe.
     */
    it(`${nome} manda observar a imagem só quando há imagem`, () => {
      expect(montar('imagem')).toMatch(/observe a imagem/i)
      expect(montar('ficha')).not.toMatch(/observe a imagem/i)
      expect(montar('ficha')).toMatch(/ficha/i)
    })

    it(`${nome} barra dedução com imagem e a autoriza sem imagem`, () => {
      expect(montar('imagem')).toMatch(/NÃO deduza/i)
      expect(montar('ficha')).toMatch(/complete o que a ficha não diz/i)
      expect(montar('ficha')).toMatch(/nunca contradiga/i)
    })

    /**
     * Gap real da rodada 1 do gauntlet: "não contradiga" não cobre OMITIR. O modelo trocava
     * "capela de Sant Iorven" por "subterrânea" e apagava "fechada desde a peste" — sem
     * contradizer nada, e obrigando o mestre a reescrever o gancho de trama na mão.
     */
    it(`${nome} exige preservar nome próprio da ficha, não só evitar contradição`, () => {
      expect(montar('ficha')).toMatch(/APROVEITE o que a ficha já dá/i)
      expect(montar('ficha')).toMatch(/nome próprio/i)
    })

    /** Outro gap da rodada 1: fato observável trocado por aproximação ("cheio" vs "quase à borda"). */
    it(`${nome} exige quantidade e estado exatos quando há imagem`, () => {
      expect(montar('imagem')).toMatch(/quantidade e o estado EXATOS/i)
    })
  }
})

describe('promptDescreverPersonagem', () => {
  const p = promptDescreverPersonagem('imagem')

  it('fixa a faixa de 4 a 6 tópicos e a lista com "- "', () => {
    expect(p).toMatch(/4 a 6/)
    expect(p).toContain('"- "')
  })

  /** A ordem É a feature: sem ela o modelo enumera por saliência visual, não por convenção de mesa. */
  it('prescreve a ordem rosto → vestimenta → o que carrega → presença → diferencial', () => {
    const ordem = ['O QUE É E O ROSTO', 'VESTIMENTA', 'O QUE CARREGA', 'PRESENÇA', 'DIFERENCIAL']
    const posicoes = ordem.map((rotulo) => p.indexOf(rotulo))
    expect(posicoes.every((i) => i >= 0)).toBe(true)
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes)
  })

  it('manda pular o item que não se aplica', () => {
    expect(p).toMatch(/PULANDO o item que não se aplica/i)
  })

  /**
   * "4 a 6 tópicos" e "pule o que não se aplica" se contradiziam: num NPC comum, presença e
   * diferencial saem e sobram 3, abaixo do piso que o mestre pediu. A saída é outro traço
   * físico — nunca presença inventada, que é justamente o que separa figurante de vilão.
   */
  it('resolve o conflito entre o piso de 4 e o pular, sem inventar presença', () => {
    expect(p).toMatch(/O piso de 4 tópicos vale mesmo depois de pular/i)
    expect(p).toMatch(/nunca invente presença ou diferencial/i)
  })

  /** Presença é a única brecha na regra "sem conclusão" — e fica ancorada em comportamento. */
  it('restringe presença ao notável e exige comportamento, não adjetivo', () => {
    expect(p).toMatch(/NPC comum NÃO recebe este tópico/i)
    expect(p).toMatch(/nunca o adjetivo pronto/i)
    expect(p).toMatch(/é amedrontador/i)
  })

  it('traz exemplo de formato com linhas de lista', () => {
    expect(p).toMatch(/Exemplo do formato esperado:/i)
    expect(p).toMatch(/- Homem de pele morena/)
  })
})

describe('promptDescreverCenarioTopicos', () => {
  const p = promptDescreverCenarioTopicos('imagem')

  it('fixa a faixa de 4 a 6 tópicos e a lista com "- "', () => {
    expect(p).toMatch(/4 a 6/)
    expect(p).toContain('"- "')
  })

  /** Forma antes de material: nomear o espaço dá ao jogador onde pendurar o resto da descrição. */
  it('prescreve a ordem forma → material → conteúdo → quem está lá → detalhe', () => {
    const ordem = ['FORMA E TIPO', 'DO QUE É FEITO', 'O QUE TEM DENTRO', 'QUEM ESTÁ LÁ', 'O QUE PUXA A ATENÇÃO']
    const posicoes = ordem.map((rotulo) => p.indexOf(rotulo))
    expect(posicoes.every((i) => i >= 0)).toBe(true)
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes)
  })

  it('barra repetir o mesmo elemento em dois tópicos', () => {
    expect(p).toMatch(/NÃO repita/i)
  })

  it('pede quantidade e posição dos móveis, não só a lista deles', () => {
    expect(p).toMatch(/quantos e ONDE/i)
  })
})

describe('promptDescreverCenarioCorrido', () => {
  const p = promptDescreverCenarioCorrido('imagem')

  it('pede parágrafo curto para ler em voz alta, não lista', () => {
    expect(p).toMatch(/3 a 5 frases/)
    expect(p).toMatch(/LER EM VOZ ALTA/i)
    expect(p).toMatch(/sem tópicos/i)
  })

  it('mantém a mesma ordem por baixo da prosa', () => {
    expect(p).toMatch(/que lugar é esse e que forma tem.*do que ele é feito.*o que tem dentro.*quem está lá/i)
  })

  it('traz o exemplo da biblioteca como molde de tom e tamanho', () => {
    expect(p).toMatch(/Vocês entram numa biblioteca/i)
  })

  it('devolve só o parágrafo, sem aspas nem título', () => {
    expect(p).toMatch(/sem título, sem aspas e sem preâmbulo/i)
  })
})

describe('promptDescreverItem', () => {
  const p = promptDescreverItem('imagem')

  it('fica em 1 ou 2 tópicos — item comum não sustenta cinco', () => {
    expect(p).toMatch(/1 ou 2 tópicos/i)
    expect(p).toMatch(/Item comum termina no primeiro tópico/i)
  })

  it('exige vagueza: nada de função, magia, valor ou procedência', () => {
    expect(p).toMatch(/VAGO de propósito/i)
    expect(p).toMatch(/não explique para que serve/i)
    expect(p).toMatch(/não diga se é mágico/i)
  })

  it('traz exemplo de item comum e de item notável', () => {
    expect(p).toMatch(/Exemplo de item comum:/i)
    expect(p).toMatch(/Exemplo de item notável:/i)
    expect(p).toMatch(/- Um pote de barro com leite/)
  })
})

describe('REGRA_MARCADORES', () => {
  it('instrui a manter os marcadores {{IMG:n}} intactos', () => {
    expect(REGRA_MARCADORES).toContain('{{IMG:')
    expect(REGRA_MARCADORES).toMatch(/mantenha|não remova|exatamente/i)
  })
})

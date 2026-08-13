import { describe, it, expect } from 'vitest'
import {
  promptDescreverImagemTopicos,
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

describe('promptDescreverImagemTopicos', () => {
  const p = promptDescreverImagemTopicos()

  it('fixa a faixa de 4 a 6 tópicos', () => {
    expect(p).toMatch(/4 a 6/)
  })

  it('pede lista com "- "', () => {
    expect(p).toContain('"- "')
  })

  /** O defeito central: entregar a leitura pronta da cena rouba a narração do mestre. */
  it('barra sensação e conclusão pronta', () => {
    expect(p).toMatch(/aconchegante/i)
    expect(p).toMatch(/sensação|conclusão/i)
  })

  it('barra repetir o mesmo elemento em dois tópicos', () => {
    expect(p).toMatch(/não repita|NÃO repita/i)
  })

  it('barra deduzir o que a imagem não mostra', () => {
    expect(p).toMatch(/não deduza|NÃO deduza/i)
  })

  it('pede o concreto sobre a categoria', () => {
    expect(p).toMatch(/concreto/i)
    expect(p).toMatch(/lareira/i)
  })

  it('pede só a lista, sem preâmbulo', () => {
    expect(p).toMatch(/sem título nem preâmbulo/i)
  })
})

describe('REGRA_MARCADORES', () => {
  it('instrui a manter os marcadores {{IMG:n}} intactos', () => {
    expect(REGRA_MARCADORES).toContain('{{IMG:')
    expect(REGRA_MARCADORES).toMatch(/mantenha|não remova|exatamente/i)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { createTLSchema, defaultShapeSchemas } from 'tldraw'

vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => p }))

import { CenarioCardShapeUtil } from '../components/CenarioCardShape'

/**
 * Canvas salvo antes da faixa de itens tem card de cenário sem `itensFaixa`. Ele precisa
 * subir de versão com a faixa OCULTA e o mesmo tamanho: se o tldraw recusasse o documento, o
 * canvas não abria; se a faixa nascesse visível, todo card do cofre cresceria sozinho.
 */
const SEQUENCIA = 'com.tldraw.shape.cenario-card'
/** Última versão antes da faixa: `AdicionaFonteEscala`. */
const VERSAO_ANTES_DA_FAIXA = 2

function schemaComCenario() {
  return createTLSchema({
    shapes: {
      ...defaultShapeSchemas,
      'cenario-card': { props: CenarioCardShapeUtil.props, migrations: CenarioCardShapeUtil.migrations },
    },
  })
}

const PROPS_ANTIGAS = {
  w: 480, h: 390, cenarioId: 'goa', expandido: true,
  infoExpandido: true, infoAoLado: false, eventosExpandido: false, eventosAoLado: false,
  itensExpandido: false, itensAoLado: false, fonteEscala: 1.2,
}

function cardAntigo(props: Record<string, unknown>) {
  return {
    typeName: 'shape' as const,
    id: 'shape:cenario-antigo' as never,
    type: 'cenario-card',
    x: 0, y: 0, rotation: 0,
    index: 'a1' as never,
    parentId: 'page:page' as never,
    isLocked: false, opacity: 1, meta: {},
    props,
  }
}

describe('migração do card de cenário para a faixa de itens', () => {
  it('card salvo antes da faixa abre com a faixa oculta e o mesmo tamanho', () => {
    const schema = schemaComCenario()
    const atual = schema.serialize()
    const origem = { ...atual, sequences: { ...atual.sequences, [SEQUENCIA]: VERSAO_ANTES_DA_FAIXA } }

    const resultado = schema.migratePersistedRecord(cardAntigo({ ...PROPS_ANTIGAS }) as never, origem)

    expect(resultado.type).toBe('success')
    if (resultado.type !== 'success') return
    const migrado = resultado.value as ReturnType<typeof cardAntigo>
    expect(migrado.props).toEqual({ ...PROPS_ANTIGAS, itensFaixa: 'oculta' })
    // a validação do schema é onde o tldraw recusa o documento inteiro
    expect(() => schema.validateRecord(null as never, migrado as never, 'initialize', null)).not.toThrow()
  })

  it('valor de lado desconhecido é recusado pelo schema', () => {
    const schema = schemaComCenario()
    const invalido = cardAntigo({ ...PROPS_ANTIGAS, itensFaixa: 'diagonal' })
    expect(() => schema.validateRecord(null as never, invalido as never, 'initialize', null)).toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { createTLSchema, defaultShapeSchemas } from 'tldraw'
import { SalaMapaShapeUtil } from '../components/SalaMapaShape'

/**
 * Verifica que um mapa salvo ANTES desta mudança — sala-mapa sem `cenarioId` — sobe de
 * versão sozinho em vez de o tldraw recusar o documento inteiro. Sem isto não dá pra
 * confiar só na leitura do código: a validação do schema é onde o tldraw rejeita
 * documentos, e é exatamente essa validação que este teste exercita.
 */
describe('migração sala-mapa: AdicionaCenarioId', () => {
  it('sala antiga (sem cenarioId) migra para cenarioId vazio', () => {
    const schema = createTLSchema({
      shapes: { ...defaultShapeSchemas, 'sala-mapa': { props: SalaMapaShapeUtil.props, migrations: SalaMapaShapeUtil.migrations } },
    })

    const salaAntiga = {
      typeName: 'shape' as const,
      id: 'shape:sala1' as any,
      type: 'sala-mapa',
      x: 0,
      y: 0,
      rotation: 0,
      index: 'a1' as any,
      parentId: 'page:page' as any,
      isLocked: false,
      opacity: 1,
      meta: {},
      props: { w: 160, h: 112, estado: 'pendente', rotulo: 'Cozinha', cor: '' },
    }

    // schema "de origem" = o atual, mas com a sequência de migrações do sala-mapa
    // recuada em 1 — ou seja, o arquivo foi salvo ANTES de existir AdicionaCenarioId.
    const schemaAtual = schema.serialize()
    const schemaAntigo = {
      ...schemaAtual,
      sequences: {
        ...schemaAtual.sequences,
        'com.tldraw.shape.sala-mapa': (schemaAtual.sequences['com.tldraw.shape.sala-mapa'] ?? 0) - 1,
      },
    }

    const resultado = schema.migratePersistedRecord(salaAntiga as any, schemaAntigo)

    expect(resultado.type).toBe('success')
    if (resultado.type === 'success') {
      expect((resultado.value as any).props.cenarioId).toBe('')
    }
  })
})

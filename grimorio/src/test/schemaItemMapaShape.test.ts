import { describe, it, expect } from 'vitest'
import { createTLSchema, defaultShapeSchemas } from 'tldraw'
import { SalaMapaShapeUtil } from '../components/SalaMapaShape'
import { ItemMapaShapeUtil } from '../components/ItemMapaShape'

/**
 * `item-mapa` é um shape NOVO (ver o porquê no cabeçalho de `ItemMapaShape.tsx`: evitar
 * migração acrescentando prop a `item-card`, que já está em documentos salvos). A decisão
 * de "shape novo não precisa migração" merece prova, não só o comentário — é exatamente
 * o tipo de suposição que `migracaoSalaCenarioId.test.ts` já pegou errada uma vez para
 * `cenarioId`.
 *
 * Este teste monta um schema real incluindo `item-mapa` e confere que um mapa salvo
 * ANTES dele existir (uma sala comum, sem nenhum `item-mapa`) continua migrando/validando
 * normalmente — o novo tipo não é obrigatório em documento nenhum, só passa a ser
 * aceito quando presente.
 */
describe('schema com item-mapa: documento antigo sem o tipo continua válido', () => {
  it('sala-mapa salva antes de item-mapa existir migra normalmente sob o schema novo', () => {
    const schema = createTLSchema({
      shapes: {
        ...defaultShapeSchemas,
        'sala-mapa': { props: SalaMapaShapeUtil.props, migrations: SalaMapaShapeUtil.migrations },
        'item-mapa': { props: ItemMapaShapeUtil.props },
      },
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
      // já inclui cenarioId: representa um mapa salvo DEPOIS da migração da sala mas
      // ANTES de item-mapa existir — o caso real que este teste protege.
      props: { w: 160, h: 112, estado: 'pendente', rotulo: 'Cozinha', cor: '', cenarioId: '' },
    }

    const resultado = schema.migratePersistedRecord(salaAntiga as any, schema.serialize())

    expect(resultado.type).toBe('success')
    if (resultado.type === 'success') {
      expect((resultado.value as any).type).toBe('sala-mapa')
    }
  })

  it('um item-mapa novo valida com os defaults documentados', () => {
    const schema = createTLSchema({
      shapes: { ...defaultShapeSchemas, 'item-mapa': { props: ItemMapaShapeUtil.props } },
    })

    const pino = {
      typeName: 'shape' as const,
      id: 'shape:pino1' as any,
      type: 'item-mapa',
      x: 0,
      y: 0,
      rotation: 0,
      index: 'a1' as any,
      parentId: 'page:page' as any,
      isLocked: false,
      opacity: 1,
      meta: {},
      props: { w: 18, h: 24, itemId: 'algum-id' },
    }

    const resultado = schema.migratePersistedRecord(pino as any, schema.serialize())
    expect(resultado.type).toBe('success')
  })
})

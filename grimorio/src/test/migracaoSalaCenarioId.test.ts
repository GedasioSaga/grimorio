import { describe, it, expect } from 'vitest'
import { T, createTLSchema, defaultShapeSchemas } from 'tldraw'
import { SalaMapaShapeUtil } from '../components/SalaMapaShape'
import { SalaPoligonoMapaShapeUtil } from '../components/SalaPoligonoMapaShape'
import { PortaShapeUtil } from '../components/PortaShape'
import { ESPESSURA_CONTORNO_SALA } from '../lib/salaMapa'

/**
 * Verifica que um mapa salvo ANTES destas mudanças — sala sem `cenarioId` e sem
 * `espessura` — sobe de versão sozinho em vez de o tldraw recusar o documento inteiro.
 * Sem isto não dá pra confiar só na leitura do código: a validação do schema é onde o
 * tldraw rejeita documentos, e é exatamente essa validação que este teste exercita.
 *
 * A versão de origem é **0**, não "a atual menos 1". A primeira versão deste teste usava
 * `-1` para dizer "salvo antes da migração que eu acabei de escrever", e isso passou a
 * mentir no instante em que uma SEGUNDA migração entrou na sequência: `-1` virou "antes da
 * espessura, mas já com cenarioId", e a asserção do cenarioId quebrou. Zero significa
 * "antes de qualquer migração desta sequência" e continua significando isso por mais
 * migrações que venham.
 */
function schemaComSalas() {
  return createTLSchema({
    shapes: {
      ...defaultShapeSchemas,
      'sala-mapa': { props: SalaMapaShapeUtil.props, migrations: SalaMapaShapeUtil.migrations },
      'sala-poligono-mapa': {
        props: SalaPoligonoMapaShapeUtil.props,
        migrations: SalaPoligonoMapaShapeUtil.migrations,
      },
    },
  })
}

function shapeBase(type: string, props: Record<string, unknown>) {
  return {
    typeName: 'shape' as const,
    id: `shape:${type}-antigo` as never,
    type,
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as never,
    parentId: 'page:page' as never,
    isLocked: false,
    opacity: 1,
    meta: {},
    props,
  }
}

/** Snapshot de schema "de origem": o atual, com a sequência daquele shape zerada. */
function schemaAntesDeTudo(schema: ReturnType<typeof schemaComSalas>, sequencia: string) {
  const atual = schema.serialize()
  return { ...atual, sequences: { ...atual.sequences, [sequencia]: 0 } }
}

describe('migração da sala retangular', () => {
  it('sala antiga (sem cenarioId nem espessura) migra sem perder o resto', () => {
    const schema = schemaComSalas()
    const salaAntiga = shapeBase('sala-mapa', { w: 160, h: 112, estado: 'pendente', rotulo: 'Cozinha', cor: '' })

    const resultado = schema.migratePersistedRecord(
      salaAntiga as never,
      schemaAntesDeTudo(schema, 'com.tldraw.shape.sala-mapa'),
    )

    expect(resultado.type).toBe('success')
    if (resultado.type !== 'success') return
    const props = (resultado.value as { props: Record<string, unknown> }).props
    expect(props.cenarioId).toBe('')
    // espessura sobe com o valor que a sala SEMPRE desenhou: mapa antigo reabre idêntico,
    // sem virar uma edição em massa que o autosave grava no cofre.
    expect(props.espessura).toBe(ESPESSURA_CONTORNO_SALA)
    expect(props.rotulo).toBe('Cozinha')
    expect(props.estado).toBe('pendente')
    // mapa antigo reabre COM a linha: migração que apaga contorno de todo cômodo do cofre
    // seria edição em massa que ninguém pediu
    expect(props.contorno).toBe(true)
  })
})

describe('migração da sala retangular ORIGINAL', () => {
  /**
   * A sala de `65f67c2` — antes de `cor`, `cenarioId` e `espessura` existirem. É o arquivo
   * de verdade em risco, e o teste anterior não o exercitava: ele montava a "sala antiga"
   * já COM `cor: ''`, então passava sem nunca tocar no buraco.
   *
   * `validateRecord` é o passo que importa aqui, não `migratePersistedRecord`. Migrar
   * devolve `success` mesmo deixando `cor` como `undefined`; quem derruba o documento
   * inteiro é a validação logo depois. Testar só a migração dá verde num mapa que não abre.
   */
  it('sala sem cor/cenarioId/espessura migra E passa na validação do schema', () => {
    const schema = schemaComSalas()
    const original = shapeBase('sala-mapa', { w: 160, h: 112, estado: 'pendente', rotulo: 'Adega' })

    const resultado = schema.migratePersistedRecord(
      original as never,
      schemaAntesDeTudo(schema, 'com.tldraw.shape.sala-mapa'),
    )
    expect(resultado.type).toBe('success')
    if (resultado.type !== 'success') return

    // Sem o degrau `AdicionaCor` isto lança
    // `ValidationError: At props.cor: Expected string, got undefined`.
    // Valida as PROPS direto com o validador da própria util — é o mesmo objeto que o
    // schema do store usa e é exatamente o passo que derrubava o documento; montar um
    // store inteiro só para chegar nele não provaria mais nada.
    const props = (resultado.value as { props: Record<string, unknown> }).props
    expect(() => T.object(SalaMapaShapeUtil.props).validate(props)).not.toThrow()
    expect(props.cor).toBe('')
  })

  it('sala que já tem cor escolhida à mão NÃO perde a cor ao migrar', () => {
    const schema = schemaComSalas()
    const pintada = shapeBase('sala-mapa', {
      w: 160,
      h: 112,
      estado: 'pendente',
      rotulo: 'Adega',
      cor: '#8a4340',
    })

    const resultado = schema.migratePersistedRecord(
      pintada as never,
      schemaAntesDeTudo(schema, 'com.tldraw.shape.sala-mapa'),
    )
    expect(resultado.type).toBe('success')
    if (resultado.type !== 'success') return
    // um `props.cor = ''` cego no degrau apagaria a cor de toda sala pintada do cofre
    expect((resultado.value as { props: Record<string, unknown> }).props.cor).toBe('#8a4340')
  })
})

describe('migração da sala em polígono', () => {
  it('polígono antigo (sem cenarioId nem espessura) migra sem perder os vértices', () => {
    const schema = schemaComSalas()
    const pontos = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ]
    const antigo = shapeBase('sala-poligono-mapa', { pontos, estado: 'limpa', rotulo: 'Salão em L', cor: '#8a4340' })

    const resultado = schema.migratePersistedRecord(
      antigo as never,
      schemaAntesDeTudo(schema, 'com.tldraw.shape.sala-poligono-mapa'),
    )

    expect(resultado.type).toBe('success')
    if (resultado.type !== 'success') return
    const props = (resultado.value as { props: Record<string, unknown> }).props
    expect(props.cenarioId).toBe('')
    expect(props.espessura).toBe(ESPESSURA_CONTORNO_SALA)
    expect(props.pontos).toEqual(pontos)
    expect(props.cor).toBe('#8a4340')
    expect(props.contorno).toBe(true)
  })
})

describe('migração da porta', () => {
  function schemaComPorta() {
    return createTLSchema({
      shapes: {
        ...defaultShapeSchemas,
        'porta-mapa': { props: PortaShapeUtil.props, migrations: PortaShapeUtil.migrations },
      },
    })
  }

  function migrarPorta(props: Record<string, unknown>) {
    const schema = schemaComPorta()
    const resultado = schema.migratePersistedRecord(
      shapeBase('porta-mapa', props) as never,
      schemaAntesDeTudo(schema, 'com.tldraw.shape.porta-mapa'),
    )
    expect(resultado.type).toBe('success')
    if (resultado.type !== 'success') throw new Error('migração falhou')
    return (resultado.value as { props: Record<string, unknown> }).props
  }

  it('porta no formato velho (cor, sem estado) migra e passa na validação', () => {
    const props = migrarPorta({ w: 20, h: 4, cor: '#8a4340' })
    expect(props.estado).toBe('livre')
    // `cor` sobrando reprova igual a `estado` faltando: o validador de objeto do tldraw
    // recusa chave desconhecida, e é o documento inteiro que não abre.
    expect(props.cor).toBeUndefined()
    expect(() => T.object(PortaShapeUtil.props).validate(props)).not.toThrow()
  })

  it('porta TRANCADA de hoje não é destrancada pela migração', () => {
    // Esta é a armadilha: como este é o PRIMEIRO degrau da porta, todo documento já salvo
    // conta como versão 0 e passa por aqui — inclusive os que já estão certos. Sem o guard
    // por `undefined`, abrir o cofre destrancaria todas as portas de todos os mapas.
    expect(migrarPorta({ w: 20, h: 4, estado: 'trancada' }).estado).toBe('trancada')
    expect(migrarPorta({ w: 20, h: 4, estado: 'atencao' }).estado).toBe('atencao')
  })
})

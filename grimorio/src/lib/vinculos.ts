import type { Vinculo } from './types'

/** Tipo reservado do vínculo entidade↔campanha. */
export const TIPO_PARTICIPA = 'participa'

/** Sugestões do dropdown de tipos (o UI também aceita texto livre). */
export const TIPOS_SUGERIDOS = [
  'conhece', 'aliado de', 'inimigo de', 'família de', 'mentor de',
  'deve favor a', 'mora em', 'frequenta', 'protege', 'teme',
]

/** Adiciona com dedupe por (deId, paraId, tipo). Retorna a MESMA lista se nada mudou. */
export function adicionarVinculo(lista: Vinculo[], v: Vinculo): Vinculo[] {
  const existe = lista.some((x) => x.deId === v.deId && x.paraId === v.paraId && x.tipo === v.tipo)
  return existe ? lista : [...lista, v]
}

export function removerVinculo(lista: Vinculo[], id: string): Vinculo[] {
  return lista.filter((x) => x.id !== id)
}

/** Relações da entidade nas duas direções (participação em campanha fica de fora). */
export function vinculosDaEntidade(lista: Vinculo[], id: string): Vinculo[] {
  return lista.filter((x) => x.paraTipo !== 'campanha' && (x.deId === id || x.paraId === id))
}

/** Grupo de relações entre a entidade e uma outra ponta (para as setas do canvas). */
export interface ParDeRelacoes {
  deId: string
  paraId: string
  tipos: string[]
}

/**
 * Agrupa as relações da entidade por "outra ponta". A direção (deId→paraId) é a do
 * PRIMEIRO vínculo do par; tipos adicionais entram só no rótulo — se houver vínculos
 * em direções opostas no mesmo par, o rótulo combinado não indica qual tipo é de qual
 * direção (limitação aceita; caso raro). Tipos repetidos (mesma relação cadastrada
 * pelos dois lados) entram uma vez só no rótulo.
 */
export function agruparPorPar(lista: Vinculo[], entidadeId: string): ParDeRelacoes[] {
  const porPar = new Map<string, ParDeRelacoes>()
  for (const v of vinculosDaEntidade(lista, entidadeId)) {
    const outraId = v.deId === entidadeId ? v.paraId : v.deId
    const g = porPar.get(outraId)
    if (g) {
      if (!g.tipos.includes(v.tipo)) g.tipos.push(v.tipo)
    } else {
      porPar.set(outraId, { deId: v.deId, paraId: v.paraId, tipos: [v.tipo] })
    }
  }
  return [...porPar.values()]
}

/** Ids das campanhas em que a entidade participa. */
export function campanhasDe(lista: Vinculo[], entidadeId: string): string[] {
  return lista
    .filter((x) => x.paraTipo === 'campanha' && x.tipo === TIPO_PARTICIPA && x.deId === entidadeId)
    .map((x) => x.paraId)
}

/** Entidades (personagens e cenários) que participam da campanha. */
export function idsDaCampanha(lista: Vinculo[], campanhaId: string): Set<string> {
  const ids = new Set<string>()
  for (const x of lista) {
    if (x.paraTipo === 'campanha' && x.tipo === TIPO_PARTICIPA && x.paraId === campanhaId) ids.add(x.deId)
  }
  return ids
}

/** Vínculo de participação exato entidade↔campanha, se existir. */
export function participacaoDe(lista: Vinculo[], entidadeId: string, campanhaId: string): Vinculo | undefined {
  return lista.find(
    (x) => x.paraTipo === 'campanha' && x.tipo === TIPO_PARTICIPA && x.deId === entidadeId && x.paraId === campanhaId,
  )
}

/**
 * Normaliza o conteúdo lido de vinculos.json: entradas sem id/deId/paraId/tipo
 * válidos ou com deTipo/paraTipo fora do domínio são descartadas; campos
 * secundários (notas, criadoEm) são reparados com default.
 */
export function normalizarVinculos(raw: unknown): Vinculo[] {
  const lista = (raw as { vinculos?: unknown })?.vinculos
  if (!Array.isArray(lista)) return []
  const out: Vinculo[] = []
  for (const x of lista) {
    const v = x as Partial<Vinculo> | null
    if (!v) continue
    if (typeof v.id !== 'string' || !v.id) continue
    if (typeof v.deId !== 'string' || !v.deId) continue
    if (typeof v.paraId !== 'string' || !v.paraId) continue
    if (typeof v.tipo !== 'string' || !v.tipo) continue
    if (v.deTipo !== 'personagem' && v.deTipo !== 'cenario' && v.deTipo !== 'canvas') continue
    // canvas nunca é alvo de relação (só participa de campanha) → fora do paraTipo aceito
    if (v.paraTipo !== 'personagem' && v.paraTipo !== 'cenario' && v.paraTipo !== 'campanha') continue
    out.push({
      id: v.id,
      deTipo: v.deTipo,
      deId: v.deId,
      paraTipo: v.paraTipo,
      paraId: v.paraId,
      tipo: v.tipo,
      notas: typeof v.notas === 'string' ? v.notas : '',
      criadoEm: typeof v.criadoEm === 'string' ? v.criadoEm : '',
    })
  }
  return out
}

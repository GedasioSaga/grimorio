/**
 * Vínculo entre uma sala do mapa e um Cenário (ficha).
 *
 * A sala guarda só o id do cenário em `cenarioId`; o cenário em si pode ter sido
 * excluído depois do vínculo criado. Resolver aqui decide o que mostrar sem que a sala
 * suma ou o mapa quebre — ver "vínculo quebrado" no chamador.
 */

export type EstadoVinculoSala = 'sem-vinculo' | 'vinculado' | 'quebrado' | 'carregando'

export interface VinculoSala {
  estado: EstadoVinculoSala
  /** nome do cenário, só quando `vinculado` */
  nomeCenario: string | null
}

/**
 * `nomes` mapeia id de cenário → nome (ex.: `s.cenarios` reduzido). Cenário ausente do
 * mapa = excluído → vínculo quebrado, não sem-vínculo: a sala continua "sabendo" que
 * apontava para algo, só que esse algo sumiu.
 *
 * `cacheCarregado` existe porque "ainda não li os cenários" e "este cenário não existe mais"
 * chegam aqui como a MESMA coisa: uma chave ausente. `vaultPath` é setado antes de
 * `carregarCenarios()` resolver (store.ts), e a sidebar já fica clicável nesse meio-tempo —
 * então dá para abrir um mapa com o cache ainda vazio. Sem esta distinção, TODA sala ligada
 * piscaria com o aviso de vínculo quebrado logo depois de abrir o cofre, que é a mesma cara de
 * um estrago de verdade. Alarme falso rotineiro treina o usuário a ignorar o alarme.
 */
export function resolverVinculoSala(
  cenarioId: string,
  nomes: Record<string, string>,
  cacheCarregado = true,
): VinculoSala {
  if (!cenarioId) return { estado: 'sem-vinculo', nomeCenario: null }
  const nome = nomes[cenarioId]
  if (nome !== undefined) return { estado: 'vinculado', nomeCenario: nome }
  return { estado: cacheCarregado ? 'quebrado' : 'carregando', nomeCenario: null }
}

export interface OpcaoCenario {
  id: string
  nome: string
}

/** Opções do seletor do painel de propriedades, em ordem alfabética (pt-BR). */
export function opcoesDeCenario(refs: Array<{ id: string; nome: string }>): OpcaoCenario[] {
  return [...refs].map((r) => ({ id: r.id, nome: r.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

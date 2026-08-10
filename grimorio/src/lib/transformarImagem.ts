import type { VaultTree } from './types'

export type TipoTransformacao = 'personagem' | 'cenario' | 'item'

export const ROTULO_TIPO: Record<TipoTransformacao, string> = {
  personagem: 'Personagem',
  cenario: 'Cenário',
  item: 'Item',
}

/** Opção de pasta destino no diálogo de transformação (nivel = recuo visual). */
export interface OpcaoPasta {
  nome: string
  caminho: string
  nivel: number
}

type NoDePasta = { nome: string; caminho: string; subpastas: NoDePasta[] }

function achatar(no: NoDePasta, nivel: number, saida: OpcaoPasta[]): void {
  saida.push({ nome: no.nome, caminho: no.caminho, nivel })
  for (const sub of no.subpastas) achatar(sub, nivel + 1, saida)
}

/** Pastas da seção do tipo, raiz primeiro, em pré-ordem com nível de recuo. */
export function pastasDaSecao(tree: VaultTree | null, tipo: TipoTransformacao): OpcaoPasta[] {
  if (!tree) return []
  const raiz: NoDePasta =
    tipo === 'personagem' ? tree.personagensSoltos : tipo === 'cenario' ? tree.cenarios : tree.itens
  const saida: OpcaoPasta[] = []
  achatar(raiz, 0, saida)
  return saida
}

/** Sugestão de nome de entidade a partir do nome do arquivo da imagem (sem extensão). */
export function sugestaoDeNome(nomeArquivo: string): string {
  return nomeArquivo.trim().replace(/\.[a-z0-9]+$/i, '').trim()
}

/** Extensão do arquivo em minúsculas; png quando não dá para deduzir. */
export function extensaoDe(rel: string): string {
  return rel.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? 'png'
}

/** Diretório da entidade a partir do caminho do seu JSON (ou o próprio caminho, se já for dir). */
export function dirDoCaminho(caminho: string): string {
  return caminho.replace(/[\\/][^\\/]+\.json$/i, '')
}

/**
 * Destino do retrato no cofre, seguindo o padrão que cada entidade já usa:
 * personagem em assets/ da própria pasta; cenário e item nas pastas globais de imagem.
 */
export function destinoRetrato(
  tipo: TipoTransformacao,
  ent: { id: string; caminho: string; versaoAtivaId?: string },
  ext: string,
): string {
  if (tipo === 'personagem') {
    return `${dirDoCaminho(ent.caminho)}/assets/retrato-${ent.id}-${ent.versaoAtivaId}.${ext}`
  }
  if (tipo === 'cenario') return `imagens-cenarios/retrato-${ent.id}-${ent.versaoAtivaId}.${ext}`
  return `imagens-itens/retrato-${ent.id}.${ext}`
}

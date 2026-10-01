import { normalizarCaminho } from '../cofres'
import type { FsBridge } from '../fsBridge'

/**
 * Qual foi a última organização de cada cofre — o que o botão "Desfazer última organização" desfaz.
 *
 * Mora ao lado dos diários, fora do cofre (`<dirBase>/ultimas.json`), porque desfazer é por
 * máquina: o diário com as cópias dos originais só existe no computador que organizou.
 *
 * A chave é o caminho do cofre com `/` e sem caixa: no Windows `C:\Cofre` e `c:/cofre` são o mesmo
 * cofre, e o app às vezes recebe um, às vezes o outro, do seletor de pasta.
 */

const ARQUIVO = 'ultimas.json'

/**
 * O cofre como o Windows o compara: `/`, sem barra no fim, sem caixa. O executor usa a mesma chave
 * para só desfazer no cofre em que organizou, e o id do plano também, para dois cofres não dividirem
 * o mesmo diário.
 */
export function chaveDoCofre(raiz: string): string {
  return normalizarCaminho(raiz).replace(/\/+$/, '').toLowerCase()
}

async function lerMapa(dirBase: string, fs: FsBridge): Promise<Record<string, string>> {
  try {
    const bruto: unknown = JSON.parse(await fs.readText(`${dirBase}/${ARQUIVO}`))
    if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return {}
    const mapa: Record<string, string> = {}
    for (const [k, v] of Object.entries(bruto)) if (typeof v === 'string') mapa[k] = v
    return mapa
  } catch {
    return {} // ainda não existe, ou ilegível: sem registro é o mesmo que nada a desfazer
  }
}

/** Anota `planoId` como a última organização do cofre `raiz`. */
export async function registrarUltima(dirBase: string, raiz: string, planoId: string, fs: FsBridge): Promise<void> {
  const mapa = await lerMapa(dirBase, fs)
  mapa[chaveDoCofre(raiz)] = planoId
  await fs.writeTextAtomic(`${dirBase}/${ARQUIVO}`, JSON.stringify(mapa, null, 2))
}

/** Id do plano da última organização do cofre, ou `null` se nunca organizou nesta máquina. */
export async function lerUltimoPlano(dirBase: string, raiz: string, fs: FsBridge): Promise<string | null> {
  const planoId = (await lerMapa(dirBase, fs))[chaveDoCofre(raiz)]
  return planoId === undefined ? null : planoId
}

/** Pasta do diário da última organização do cofre, ou `null` se nunca organizou nesta máquina. */
export async function lerUltima(dirBase: string, raiz: string, fs: FsBridge): Promise<string | null> {
  const planoId = await lerUltimoPlano(dirBase, raiz, fs)
  return planoId === null ? null : `${dirBase}/${planoId}`
}

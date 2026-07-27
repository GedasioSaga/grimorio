import { normalizarCaminho } from '../cofres'
import type { FsBridge } from '../fsBridge'
import type { Manifesto } from './tipos'

/**
 * Persistência do manifesto. Duas decisões de desenho carregam o arquivo inteiro:
 *
 * 1. **Mora FORA do cofre.** Dentro dele o manifesto sincronizaria a si mesmo e daria conflito a
 *    cada ciclo — o registro do último sync mudaria durante o próprio sync.
 * 2. **Duas cópias, rotacionadas.** A anterior só é promovida depois de um ciclo COMPLETO e
 *    bem-sucedido (o `--recover` do rclone). Um manifesto corrompido no meio da gravação não pode
 *    deixar o motor sem ideia do último estado bom: sem manifesto, o próximo sync trata o cofre
 *    inteiro como novo.
 *
 * O `FsBridge` entra injetado e o hash entra pronto — nada de Tauri aqui dentro.
 */

const ATUAL = 'manifesto.json'
const ANTERIOR = 'manifesto.anterior.json'

/**
 * Texto que o chamador passa a `hash_texto` para derivar o diretório. Normalizado porque
 * 'C:\x' e 'C:/x' são o MESMO cofre: sem isso ele ganharia dois manifestos, e o segundo veria o
 * cofre inteiro como novo. Mesma identidade que `cofres.ts` usa no registro de cofres abertos.
 */
export function chaveDoCofre(caminhoDoCofre: string): string {
  return normalizarCaminho(caminhoDoCofre)
}

/**
 * `<appConfigDir>/cofres/<hash>`. Composição pura: quem resolve `appConfigDir()` e `hash_texto()`
 * é o chamador, e é isso que deixa a montagem testável sem Tauri.
 */
export function diretorioDoManifesto(dirConfig: string, hash: string): string {
  // barra final some antes de juntar: '<dir>/' + '/cofres' viraria '//cofres', que é outro caminho
  return `${normalizarCaminho(dirConfig).replace(/\/+$/, '')}/cofres/${hash}`
}

/**
 * Descarta o que não é manifesto v1. `arquivos`/`pastas` tortos fariam o motor enxergar zero
 * arquivos conhecidos e tratar o cofre inteiro como novo — exatamente o que a cópia anterior existe
 * para evitar. Melhor cair no backup do que confiar num objeto que só parece manifesto.
 */
function ehManifesto(valor: unknown): valor is Manifesto {
  if (typeof valor !== 'object' || valor === null) return false
  const m = valor as Manifesto
  return m.versao === 1
    && typeof m.arquivos === 'object' && m.arquivos !== null
    && typeof m.pastas === 'object' && m.pastas !== null
}

async function tentarLer(caminho: string, fs: FsBridge): Promise<Manifesto | null> {
  try {
    const lido: unknown = JSON.parse(await fs.readText(caminho))
    return ehManifesto(lido) ? lido : null
  } catch {
    return null
  }
}

/**
 * Manifesto do último sync, ou `null` no primeiro ciclo (ou quando as duas cópias se perderam).
 *
 * Cópia ilegível cai na anterior, ao contrário de `garantirIdDePasta` no vaultRepo, que se RECUSA
 * a seguir com arquivo ilegível. A assimetria é proposital: lá o passo seguinte sobrescreveria um
 * nome possivelmente recuperável à mão; aqui ler não destrói nada, e um manifesto velho porém
 * válido é estritamente melhor que nenhum.
 */
export async function lerManifesto(dir: string, fs: FsBridge): Promise<Manifesto | null> {
  return (await tentarLer(`${dir}/${ATUAL}`, fs)) ?? (await tentarLer(`${dir}/${ANTERIOR}`, fs))
}

/** Grava o manifesto corrente. Não encosta na cópia anterior — promovê-la é trabalho da rotação. */
export async function gravarManifesto(dir: string, manifesto: Manifesto, fs: FsBridge): Promise<void> {
  // explícito porque a garantia é do módulo: o contrato do FsBridge não promete criar o pai
  await fs.mkdirAll(dir)
  await fs.writeTextAtomic(`${dir}/${ATUAL}`, JSON.stringify(manifesto, null, 2))
}

/**
 * Promove o manifesto corrente a cópia de segurança. Só depois de um ciclo COMPLETO: rotacionar
 * antes do fim guardaria como "último estado bom" um estado que o ciclo ainda pode invalidar.
 *
 * A falha propaga de propósito. Rotação silenciosamente pulada = backup congelado para sempre, que
 * é justamente a situação contra a qual as duas cópias existem.
 */
export async function rotacionar(dir: string, fs: FsBridge): Promise<void> {
  await fs.copyFile(`${dir}/${ATUAL}`, `${dir}/${ANTERIOR}`)
}

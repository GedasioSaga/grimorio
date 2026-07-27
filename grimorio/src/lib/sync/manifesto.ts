import { normalizarCaminho } from '../cofres'
import type { FsBridge } from '../fsBridge'
import type { EntradaArquivo, Manifesto } from './tipos'

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
 * O `FsBridge` e a função de hash entram INJETADOS — nada de Tauri aqui dentro.
 */

const ATUAL = 'manifesto.json'
const ANTERIOR = 'manifesto.anterior.json'

/**
 * `<appConfigDir>/cofres/<hash do caminho do cofre>`.
 *
 * Recebe a função de hash em vez do hash pronto porque a normalização precisa ser IMPOSSÍVEL de
 * pular: 'C:\x' e 'C:/x' são o MESMO cofre, e um chamador que hasheasse o caminho cru daria dois
 * manifestos ao mesmo cofre — o segundo veria o cofre inteiro como novo. Com a função injetada,
 * normalizar-e-então-hashear acontece aqui dentro e o chamador não tem como contornar, sem que o
 * módulo precise importar Tauri. Mesma identidade que `cofres.ts` usa no registro de cofres.
 */
export async function diretorioDoManifesto(
  dirConfig: string,
  caminhoDoCofre: string,
  hashTexto: (texto: string) => Promise<string>,
): Promise<string> {
  const hash = await hashTexto(normalizarCaminho(caminhoDoCofre))
  // barra final some antes de juntar: '<dir>/' + '/cofres' viraria '//cofres', que é outro caminho
  return `${normalizarCaminho(dirConfig).replace(/\/+$/, '')}/cofres/${hash}`
}

/** Uma entrada com todos os campos que `EntradaArquivo` declara. Checagem rasa: é anti-lixo, não schema. */
function ehEntradaArquivo(valor: unknown): valor is EntradaArquivo {
  if (typeof valor !== 'object' || valor === null) return false
  const e = valor as EntradaArquivo
  return typeof e.fileId === 'string'
    && typeof e.hash === 'string'
    && typeof e.tamanho === 'number'
    && typeof e.mtimeLocal === 'number'
    && typeof e.versaoRemota === 'string'
}

/**
 * `Record<string, T>` de verdade. Array é recusado explicitamente porque passaria no `typeof
 * === 'object'` e depois daria zero entradas em `Object.entries([])` — o motor concluiria que
 * não conhece nenhum arquivo e mandaria SUBIR o cofre inteiro.
 */
function ehMapa(valor: unknown, ehValorValido: (v: unknown) => boolean): boolean {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false
  return Object.values(valor).every(ehValorValido)
}

/**
 * Descarta o que não é manifesto v1. O manifesto vem do disco, que é entrada NÃO CONFIÁVEL, e os
 * dois estragos são silenciosos: mapa torto faz o motor tratar o cofre inteiro como novo (e o
 * freio de deleção em massa não salva — ele exige um mínimo de arquivos conhecidos, e aqui o total
 * é zero), e entrada nula estoura lá dentro comparando `hash`. Melhor cair na cópia anterior do
 * que confiar num objeto que só parece manifesto.
 */
function ehManifesto(valor: unknown): valor is Manifesto {
  if (typeof valor !== 'object' || valor === null) return false
  const m = valor as Manifesto
  return m.versao === 1
    && ehMapa(m.arquivos, ehEntradaArquivo)
    && ehMapa(m.pastas, (v) => typeof v === 'string')
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

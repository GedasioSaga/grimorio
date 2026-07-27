import { normalizarCaminho } from '../cofres'
import type { FsBridge } from '../fsBridge'
import type { ClienteDrive } from './driveBridge'
import { gravarManifesto, lerManifesto } from './manifesto'
import type { Manifesto } from './tipos'

/**
 * Pareamento: ligar UM cofre do disco a UMA pasta no Google Drive, e fazer o primeiro manifesto
 * nascer. É o único momento em que o sync começa a existir para um cofre — antes dele
 * `executarCiclo` devolve `naoPareado` e nada sobe nem desce.
 *
 * Três decisões carregam o arquivo:
 *
 * 1. **O primeiro manifesto nasce VAZIO** (`arquivos: {}`, `pastas: {}`), e é isso que faz as duas
 *    histórias darem certo sem que este arquivo precise distinguir uma da outra:
 *
 *    - *Primeiro computador* (o Drive não tem nada): sem entrada no manifesto e sem lado remoto,
 *      `reconciliar` manda `subir` cada arquivo. O cofre sobe inteiro.
 *    - *Segundo computador* (o Drive já tem o cofre): a matriz SEM manifesto compara os dois lados
 *      diretamente — hash igual só `registrar`, hash diferente vira `conflito` (com cópia do
 *      perdedor), só de um lado vira `subir` ou `baixar`.
 *
 *    O que essa matriz **não tem** é `apagarLocal` nem `apagarRemoto` — os dois só saem da matriz
 *    COM manifesto. Ou seja: por construção, parear um segundo computador é incapaz de apagar o
 *    que o primeiro enviou. Mentir aqui, gravando um manifesto que afirme conhecer arquivos que
 *    nunca foram sincronizados, é que abriria essa porta.
 *
 * 2. **Parear é idempotente e nunca sobrescreve.** Um manifesto novo por cima de um existente
 *    apagaria o estado do último sync — e um cofre "sem entrada no manifesto" dos dois lados vira
 *    conflito em todo arquivo que tenha divergido, enchendo o cofre de cópias. Se já há manifesto,
 *    este módulo devolve o que achou e não escreve nada.
 *
 * 3. **A inspeção vem antes da gravação.** `inspecionarNuvem` diz quantos arquivos já existem lá
 *    para que a interface possa contar ao usuário em qual das duas histórias ele está, ANTES de o
 *    manifesto existir. Ela cria a pasta do cofre no Drive (pasta vazia não é destrutivo, e
 *    `garantirPasta` reaproveita a que já houver), mas não grava nada no disco.
 */

/** O que a nuvem já tem para este cofre, antes de qualquer decisão. */
export interface NuvemDoCofre {
  /** Id de `Grimório/<nome do cofre>` no Drive. */
  pastaCofreId: string
  /** Quantos arquivos já estão lá. `0` = este é o primeiro computador a enviar. */
  arquivos: number
}

/** Os identificadores que o manifesto carrega para sempre. */
export interface IdentidadeDoPareamento {
  cofreId: string
  deviceId: string
  deviceNome: string
}

export interface DependenciasDoPareamento {
  fs: FsBridge
  /** `<appConfigDir>/cofres/<hash do caminho do cofre>`, de `diretorioDoManifesto`. */
  dirManifesto: string
  pastaCofreId: string
  identidade: IdentidadeDoPareamento
  /** Instante do pareamento, em ISO. */
  agora(): string
}

/**
 * Acha (ou cria) a pasta do cofre no Drive e conta o que já existe lá dentro.
 *
 * `nomeDoCofre` é o último segmento do caminho no disco, e portanto UM segmento: um nome com
 * barra faria o Rust criar uma cadeia de pastas em vez de uma.
 */
export async function inspecionarNuvem(
  drive: ClienteDrive,
  nomeDoCofre: string,
): Promise<NuvemDoCofre> {
  const raiz = await drive.pastaRaiz()
  const pastaCofreId = await drive.garantirPasta(raiz, nomeDoCofre)
  const conteudo = await drive.listar(pastaCofreId)
  return { pastaCofreId, arquivos: conteudo.arquivos.length }
}

/**
 * O manifesto do pareamento. Puro, para o teste poder afirmar campo a campo.
 *
 * `startPageToken` sai vazio porque o ciclo não consome o feed de mudanças: o estado remoto vem
 * da listagem inteira (ver a decisão 2 em `ciclo.ts`). O campo continua no manifesto para quando
 * o polling incremental entrar, e atravessa os ciclos intacto.
 */
export function primeiroManifesto(
  pastaCofreId: string,
  identidade: IdentidadeDoPareamento,
  quando: string,
): Manifesto {
  return {
    versao: 1,
    cofreId: identidade.cofreId,
    pastaRaizId: pastaCofreId,
    startPageToken: '',
    deviceId: identidade.deviceId,
    deviceNome: identidade.deviceNome,
    ultimoSync: quando,
    pastas: {},
    arquivos: {},
  }
}

/** Grava o primeiro manifesto, ou devolve o que já existia sem tocar nele. */
export async function parear(deps: DependenciasDoPareamento): Promise<Manifesto> {
  const existente = await lerManifesto(deps.dirManifesto, deps.fs)
  if (existente !== null) return existente

  const manifesto = primeiroManifesto(deps.pastaCofreId, deps.identidade, deps.agora())
  await gravarManifesto(deps.dirManifesto, manifesto, deps.fs)
  return manifesto
}

/**
 * Serviços que sincronizam a pasta por conta própria. Dois sincronizadores no mesmo arquivo
 * brigam pelo mesmo byte, e o cofre é quem paga.
 */
const OUTROS_SINCRONIZADORES = ['OneDrive', 'Dropbox', 'Google Drive', 'iCloud', 'Nextcloud']

/**
 * O serviço de nuvem cujo caminho engloba o cofre, ou `null`.
 *
 * Compara SEGMENTO a segmento, e por prefixo: a pasta corporativa do OneDrive se chama
 * `OneDrive - Alguma Empresa`, e procurar o nome exato deixaria justamente o caso mais comum
 * passar batido. Um `substring` no caminho inteiro erraria para o outro lado — um cofre chamado
 * `Campanha do Dropbox` viraria alarme falso.
 */
export function outroSincronizadorNoCaminho(caminho: string): string | null {
  const segmentos = normalizarCaminho(caminho).split('/')
  for (const servico of OUTROS_SINCRONIZADORES) {
    const alvo = servico.toLowerCase()
    if (segmentos.some((s) => s.toLowerCase().startsWith(alvo))) return servico
  }
  return null
}

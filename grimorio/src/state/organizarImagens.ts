import { appConfigDir } from '@tauri-apps/api/path'
import { normalizarCaminho } from '../lib/cofres'
import { tauriFs } from '../lib/fsBridge'
import { hashArquivo } from '../lib/hashBridge'
import { planejarOrganizacao } from '../lib/organizarImagens/planejar'
import {
  ErroOrganizar, abandonarOrganizacao, desfazerOrganizacao, executarPlano, situacaoDoDiario, type ResultadoDesfazer,
  type SituacaoDoDesfazer,
} from '../lib/organizarImagens/executar'
import { lerUltima, lerUltimoPlano, registrarUltima } from '../lib/organizarImagens/ultima'
import type { Plano, PortasOrganizar, ResultadoExecucao } from '../lib/organizarImagens/tipos'
import { useApp } from './store'

/**
 * A costura do "Organizar imagens": onde o motor (todo injetado, sem Tauri) encontra o disco de
 * verdade, o hash em Rust, a pasta de configuração do app e o cofre aberto.
 *
 * O diário de desfazer vai para `<appConfigDir>/organizar/<plano.id>` — a mesma raiz que o sync já
 * usa para o manifesto (`state/sync.ts`), fora do cofre: não sobe para o Drive e não aparece no app.
 */

const portas: PortasOrganizar = { fs: tauriFs, hash: hashArquivo }

async function dirBase(): Promise<string> {
  return `${normalizarCaminho(await appConfigDir()).replace(/\/+$/, '')}/organizar`
}

/**
 * Tira da tela tudo que tem autosave próprio e grava o que está pendente — o mesmo passo 1-3 de
 * `trocarCofre`. Sem isso, um mapa ou uma página aberta gravaria o endereço VELHO da imagem por
 * cima da ficha já reescrita, e a imagem quebraria depois de organizada.
 *
 * Gravação que falhou continua pendente e seria refeita mais tarde, com o endereço velho: nesse
 * caso é melhor não organizar agora.
 */
async function prepararCofre(): Promise<void> {
  useApp.setState({ aberto: null, perfilAbertoId: null, cenarioAbertoId: null, itemAbertoId: null })
  // uma volta na fila de tarefas para o React desmontar e os cleanups gravarem (ver `trocarCofre`)
  await new Promise((r) => setTimeout(r, 0))
  const falhas = await useApp.getState().descarregarFilas()
  if (falhas.length > 0) {
    throw new Error(
      `${falhas.length} ${falhas.length === 1 ? 'gravação pendente falhou' : 'gravações pendentes falharam'}. ` +
      'Resolva isso (veja a aba Nuvem ou tente salvar de novo) antes de organizar as imagens.',
    )
  }
}

function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Relê o cofre depois de o motor ter escrito nele: árvore, fichas e o canvas que reabrir. Devolve o
 * aviso quando falha, em vez de engolir: com o cache velho na memória, a próxima edição de uma ficha
 * grava o endereço ANTIGO da imagem por cima da ficha reescrita — o usuário tem de reabrir o cofre.
 */
async function relerCofre(): Promise<string | null> {
  try {
    await useApp.getState().recarregarDoDisco()
    return null
  } catch (e) {
    return `O app não conseguiu reler o cofre depois de mexer nas imagens (${mensagemDe(e)}). ` +
      'Feche e abra o cofre de novo antes de continuar editando, senão uma edição pode gravar o endereço antigo de uma imagem.'
  }
}

/** A falha do motor, com o que deu errado depois dela (releitura, registro do desfazer) junto. */
function comAviso(e: unknown, aviso: string | null): unknown {
  if (aviso === null) return e
  return e instanceof ErroOrganizar
    ? new ErroOrganizar(e.codigo, `${e.message} ${aviso}`)
    : new Error(`${mensagemDe(e)} ${aviso}`)
}

/** O resultado do motor mais o que deu errado DEPOIS dele (e que o usuário precisa saber). */
export interface ResultadoOrganizacao extends ResultadoExecucao {
  avisos: string[]
}

export interface ResultadoDesfazerNoApp extends ResultadoDesfazer {
  avisos: string[]
}

export async function preverOrganizacao(raiz: string): Promise<Plano> {
  await prepararCofre()
  return planejarOrganizacao(normalizarCaminho(raiz), portas)
}

export async function aplicarOrganizacao(
  raiz: string,
  plano: Plano,
  aoProgresso?: (feito: number, total: number, fase: string) => void,
): Promise<ResultadoOrganizacao> {
  const base = await dirBase()
  const cofre = normalizarCaminho(raiz)
  const anterior = await lerUltimoPlano(base, cofre, tauriFs)
  // Antes de fechar o que está aberto: organizar por cima de uma organização (ou volta) pela metade
  // trocaria a última do cofre, e o botão de desfazer esqueceria o único caminho de volta dela.
  if (anterior !== null && (await situacaoDoDiario(`${base}/${anterior}`, portas, cofre)) === 'pendente') {
    throw new ErroOrganizar(
      'pendente',
      'A última organização deste cofre ficou pela metade: ela, ou o desfazer dela, parou no meio. ' +
      'Termine a volta em "Desfazer última organização", ou fique com o cofre como está em ' +
      '"Manter o cofre como está", antes de organizar de novo.',
    )
  }
  await prepararCofre()
  /** Se esta organização voltar inteira, o botão de desfazer tem de continuar sendo o da anterior. */
  const registro = { feito: false }
  let resultado: ResultadoExecucao
  try {
    resultado = await executarPlano(plano, {
      raiz: cofre,
      dirDiario: `${base}/${plano.id}`,
      portas,
      aoProgresso,
      // anotada antes de a primeira imagem sair do lugar: se o app cair no meio, o botão acha o diário
      registrarDesfazer: async () => {
        await registrarUltima(base, cofre, plano.id, tauriFs)
        registro.feito = true
      },
    })
  } catch (e) {
    const avisosDaFalha: string[] = []
    if (registro.feito && anterior !== null && e instanceof ErroOrganizar && e.codigo === 'falhou') {
      await registrarUltima(base, cofre, anterior, tauriFs).catch((falha: unknown) => {
        avisosDaFalha.push(
          `Não deu para devolver o botão "Desfazer última organização" à organização anterior (${mensagemDe(falha)}).`,
        )
      })
    }
    // mesmo na recusa ou na falha revertida: o que está na tela tem de ser o que está no disco
    const falhaAoReler = await relerCofre()
    if (falhaAoReler !== null) avisosDaFalha.push(falhaAoReler)
    throw comAviso(e, avisosDaFalha.length > 0 ? avisosDaFalha.join(' ') : null)
  }
  const falhaAoReler = await relerCofre()
  return { ...resultado, avisos: falhaAoReler === null ? [] : [falhaAoReler] }
}

/** O que o botão "Desfazer última organização" tem neste cofre — e se organizar de novo está travado. */
export async function situacaoDoDesfazer(raiz: string): Promise<SituacaoDoDesfazer> {
  const cofre = normalizarCaminho(raiz)
  const dir = await lerUltima(await dirBase(), cofre, tauriFs)
  return dir === null ? 'nada' : situacaoDoDiario(dir, portas, cofre)
}

/**
 * "Manter o cofre como está": a organização (ou volta) que parou no meio sai do caminho sem nada no
 * cofre mudar — o desfazer deixa de oferecê-la e organizar de novo volta a valer. Não fecha o que
 * está aberto nem relê o cofre: só o diário, que mora fora dele, é gravado.
 */
export async function abandonarUltimaOrganizacao(raiz: string): Promise<void> {
  const cofre = normalizarCaminho(raiz)
  const dir = await lerUltima(await dirBase(), cofre, tauriFs)
  if (dir === null) throw new ErroOrganizar('nada-pendente', 'Não há organização pela metade neste cofre.')
  await abandonarOrganizacao(dir, portas, cofre)
}

export async function desfazerUltimaOrganizacao(raiz: string): Promise<ResultadoDesfazerNoApp> {
  const cofre = normalizarCaminho(raiz)
  const dir = await lerUltima(await dirBase(), cofre, tauriFs)
  if (dir === null) throw new ErroOrganizar('nada-a-desfazer', 'Não há organização deste cofre para desfazer.')
  await prepararCofre()
  let resultado: ResultadoDesfazer
  try {
    resultado = await desfazerOrganizacao(dir, portas, cofre)
  } catch (e) {
    throw comAviso(e, await relerCofre())
  }
  const falhaAoReler = await relerCofre()
  return { ...resultado, avisos: falhaAoReler === null ? [] : [falhaAoReler] }
}

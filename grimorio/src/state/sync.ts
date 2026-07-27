import { appConfigDir } from '@tauri-apps/api/path'
import { nomePadrao } from '../lib/cofres'
import { idDoDispositivo, nomeDoDispositivo } from '../lib/dispositivo'
import { tauriFs } from '../lib/fsBridge'
import { googleConta } from '../lib/googleAuth'
import { hashTexto } from '../lib/hashBridge'
import { executarCiclo, type ResultadoDoCiclo } from '../lib/sync/ciclo'
import { sondagemNoDisco, varreduraNoDisco } from '../lib/sync/disco'
import { tauriDrive } from '../lib/sync/driveBridge'
import { diretorioDoManifesto, lerManifesto } from '../lib/sync/manifesto'
import { inspecionarNuvem, parear, type NuvemDoCofre } from '../lib/sync/parear'
import { criarPreservador } from '../lib/sync/preservar'
import { criarSincronizador, relogioReal, type Sincronizador } from '../lib/sync/sincronizador'
import { varrerCofre } from '../lib/sync/varrer'
import { aoAgendarGravacao, useApp } from './store'
import { limparSync, publicarSync } from './syncStore'

/**
 * A costura: o lugar onde o motor de sync — que é todo injetado e testável sem rede — encontra o
 * Tauri, o cofre aberto e o relógio de verdade.
 *
 * Quatro regras carregam o arquivo:
 *
 * 1. **O sincronizador é POR COFRE, e morre com ele.** Um que sobrevivesse a `trocarCofre`
 *    continuaria varrendo o caminho antigo e gravando no manifesto do cofre antigo — subiria para
 *    o Drive de um cofre o conteúdo de outro. Por isso a reconstrução acompanha `vaultPath` em vez
 *    de acontecer uma vez no boot.
 * 2. **Nada daqui pode derrubar o app.** Sem internet, sem conta conectada ou com o Tauri
 *    recusando um comando, o Grimório continua sendo o mesmo app local: toda falha vira `console`
 *    e, no máximo, sincronização desligada. Nenhuma chamada daqui entra no caminho de abrir o
 *    cofre nem no de salvar.
 * 3. **Sem pareamento explícito, nada roda.** O sincronizador só é criado quando o manifesto já
 *    existe. Parear é decisão do dono do cofre, tomada no botão da aba Nuvem — não um efeito
 *    colateral de abrir o app com uma conta conectada.
 * 4. **A troca de cofre é uma corrida.** Duas trocas rápidas deixam duas reconstruções no ar, e a
 *    primeira a terminar pode ser a do cofre que já não está aberto. `geracao` é o que descarta a
 *    tardia: quem voltou de um `await` e não é mais a geração corrente desiste sem instalar nada.
 */

interface SyncDoCofre {
  caminho: string
  sinc: Sincronizador
}

let ativo: SyncDoCofre | null = null

/** Sobe a cada reconstrução. Só a geração corrente pode instalar um sincronizador. */
let geracao = 0

function desligar(): void {
  ativo?.sinc.parar()
  ativo = null
  // manifesto, falhas e freio são todos por-cofre: deixar o retrato velho de pé faria a aba Nuvem
  // descrever o cofre anterior enquanto o novo carrega
  limparSync()
}

/**
 * Desliga E invalida o que estiver em voo. `desligar` sozinho não basta aqui: uma reconstrução
 * que já passou do `await` instalaria o sincronizador DEPOIS do cancelamento, e ele ficaria
 * rodando sem ninguém para pará-lo. Subir a geração é o que a faz desistir ao voltar.
 */
function encerrar(): void {
  geracao += 1
  desligar()
}

async function diretorioDoCofre(caminho: string): Promise<string> {
  return diretorioDoManifesto(await appConfigDir(), caminho, hashTexto)
}

/** Há conta do Google guardada nesta máquina? Falha do comando conta como "não". */
async function temConta(): Promise<boolean> {
  try {
    return (await googleConta()) !== null
  } catch (e) {
    console.warn('Sync: não deu para consultar a conta do Google:', e)
    return false
  }
}

/**
 * Um ciclo completo, com todas as portas ligadas no que existe de verdade.
 *
 * `descarregarFilas` é lido do store no disparo, e não capturado agora, porque o ciclo roda
 * minutos depois: capturar a função de hoje ligaria o sync a um estado que pode já ter sido
 * substituído.
 */
function montarCiclo(caminho: string, dirManifesto: string): () => Promise<ResultadoDoCiclo> {
  return () =>
    executarCiclo({
      fs: tauriFs,
      drive: tauriDrive,
      dirManifesto,
      raizLocal: caminho,
      descarregarFilas: () => useApp.getState().descarregarFilas(),
      varrerLocal: (raiz, conhecidos) => varrerCofre(raiz, conhecidos, varreduraNoDisco),
      sondarLocal: sondagemNoDisco,
      preservador: (manifesto) =>
        criarPreservador({
          fs: tauriFs,
          drive: tauriDrive,
          raizLocal: caminho,
          deviceNome: manifesto.deviceNome,
          pastaRaizId: manifesto.pastaRaizId,
          novoId: () => crypto.randomUUID(),
          agora: () => new Date(),
        }).preservarPerdedor,
      agora: () => new Date().toISOString(),
    })
}

/**
 * Põe de pé o sincronizador do cofre `caminho`, ou deixa tudo desligado.
 *
 * O pareamento é publicado ANTES da checagem de conta de propósito: um cofre pareado numa máquina
 * sem conta conectada continua sendo um cofre pareado, e dizer "ainda não está ligado ao Google
 * Drive" ali empurraria o usuário a parear de novo um cofre que já está.
 */
async function reconstruir(caminho: string | null): Promise<void> {
  const minha = ++geracao
  desligar()
  if (caminho === null) return

  try {
    const dir = await diretorioDoCofre(caminho)
    const pareado = (await lerManifesto(dir, tauriFs)) !== null
    if (geracao !== minha) return
    publicarSync({ pareado })
    if (!pareado) return

    if (!(await temConta()) || geracao !== minha) return
    const sinc = criarSincronizador({
      ciclo: montarCiclo(caminho, dir),
      publicar: publicarSync,
      relogio: relogioReal,
    })
    ativo = { caminho, sinc }
    sinc.iniciar()
  } catch (e) {
    // App local intacto: o que se perde aqui é a sincronização, não o cofre.
    console.warn('Sync: não foi possível ligar a sincronização deste cofre:', e)
  }
}

/**
 * Liga a costura: reconstrói o sincronizador a cada troca de cofre e passa a disparar um ciclo
 * quando o app agenda uma gravação. Devolve o cancelador, para o efeito do React desfazer tudo.
 */
export function observarCofreAberto(): () => void {
  let ultimoCaminho = useApp.getState().vaultPath
  void reconstruir(ultimoCaminho)

  const desinscrever = useApp.subscribe((estado) => {
    if (estado.vaultPath === ultimoCaminho) return
    ultimoCaminho = estado.vaultPath
    void reconstruir(ultimoCaminho)
  })
  const soltarGatilho = aoAgendarGravacao(() => ativo?.sinc.agendar())

  return () => {
    desinscrever()
    soltarGatilho()
    encerrar()
  }
}

/**
 * Roda um ciclo agora — o botão "Sincronizar agora".
 *
 * Reconstruir quando não há sincronizador cobre o caso de o usuário ter acabado de entrar na
 * conta: no boot não havia conta, então nada foi criado. A reconstrução já dispara a primeira
 * rodada, e pedir outra logo em seguida só repetiria o mesmo trabalho.
 */
export async function sincronizarAgora(): Promise<void> {
  if (ativo === null) {
    await reconstruir(useApp.getState().vaultPath)
    return
  }
  await ativo.sinc.sincronizarAgora()
}

/** O cofre aberto e o que a nuvem já tem para ele. Não grava nada no disco. */
export interface CofreNaNuvem {
  caminho: string
  nome: string
  nuvem: NuvemDoCofre
}

/**
 * Primeira metade do pareamento: descobre (criando se preciso) a pasta do cofre no Drive e conta
 * o que já está lá, para a interface poder perguntar antes de gravar qualquer coisa.
 */
export async function inspecionarCofreAtual(): Promise<CofreNaNuvem> {
  const caminho = useApp.getState().vaultPath
  if (caminho === null) throw new Error('Não há cofre aberto para ligar ao Google Drive.')
  const nome = nomePadrao(caminho)
  return { caminho, nome, nuvem: await inspecionarNuvem(tauriDrive, nome) }
}

/**
 * Segunda metade: grava o primeiro manifesto e liga o sync.
 *
 * A conferência do cofre existe porque entre a pergunta e a resposta cabe uma troca de cofre —
 * são vários diálogos —, e gravar o manifesto do cofre A no diretório do cofre B ligaria o cofre
 * errado à pasta do Drive.
 */
export async function concluirPareamento(alvo: CofreNaNuvem): Promise<void> {
  if (useApp.getState().vaultPath !== alvo.caminho) {
    throw new Error('O cofre mudou enquanto isso. Abra as Opções de novo e tente mais uma vez.')
  }
  await parear({
    fs: tauriFs,
    dirManifesto: await diretorioDoCofre(alvo.caminho),
    pastaCofreId: alvo.nuvem.pastaCofreId,
    identidade: {
      cofreId: crypto.randomUUID(),
      deviceId: idDoDispositivo(),
      deviceNome: nomeDoDispositivo(),
    },
    agora: () => new Date().toISOString(),
  })
  await reconstruir(alvo.caminho)
}

import type { FsBridge } from '../fsBridge'
import type { ClienteDrive, ConteudoRemoto } from './driveBridge'
import { executarPlano, type AcaoConflito, type FalhaAcao } from './executar'
import { gravarManifesto, lerManifesto, rotacionar } from './manifesto'
import { reconciliar } from './reconciliar'
import type { EntradaArquivo, EstadoLocal, EstadoRemoto, Manifesto } from './tipos'

/**
 * UM ciclo de sincronização, do começo ao fim: descarrega as filas, lê os dois lados, chama o
 * motor, aplica o freio, executa e grava o manifesto. Não sabe QUANDO rodar — isso é do
 * `sincronizador.ts`.
 *
 * Quatro decisões estruturam o arquivo:
 *
 * 1. **A fila do app é descarregada ANTES de o disco ser lido.** As gravações do Grimório são
 *    debounced em 800 ms (`store.ts`), e o caminho é re-resolvido no disparo. Ler o cofre com algo
 *    ainda na fila sobe a versão VELHA do arquivo, que no outro computador passa por cima da nova.
 * 2. **O estado remoto vem da listagem inteira, nunca do `changes.list`.** O feed de mudanças
 *    perde o objeto `file` na exclusão, entrega `newStartPageToken` só na última página, tem ~2 s
 *    de consistência eventual e não distingue "apagado" de "saiu do seu alcance" (os quatro
 *    achados do spike, no design). Derivar o que mudou dele exigiria acertar as quatro coisas; a
 *    listagem responde a mesma pergunta sem nenhuma delas. O feed serve para decidir SE vale rodar
 *    um ciclo, e essa é uma otimização de gatilho — nunca fonte de verdade sobre o que mudou.
 * 3. **O freio é um fim de linha, não um aviso.** Quando `reconciliar` recusa, este ciclo não
 *    executa NADA e devolve a recusa para quem orquestra perguntar ao usuário. É por isso que
 *    `executarPlano` recebe `Acao[]` e não `Plano`.
 * 4. **Erro de infraestrutura SOBE.** Rede caindo, disco negando leitura: o ciclo deixa a exceção
 *    passar e quem contém é o sincronizador, que a transforma em estado e agenda a próxima rodada.
 *    Devolver `{ tipo: 'erro' }` aqui misturaria falha de máquina com decisão de produto.
 */

/**
 * Uma gravação do app que não chegou ao disco. Forma mínima de propósito: `FalhaDescarga` mora em
 * `state/store.ts`, e `lib/sync` não pode depender de `state` sem inverter as camadas. A do store
 * tem estes campos e mais um (`erro`), então ela satisfaz este contrato sem conversão nenhuma.
 */
export interface FalhaDeGravacao {
  caminho: string
  /** Nome que o usuário reconhece ('Bruce Wayne', 'Vínculos'). */
  rotulo: string
}

export interface DependenciasDoSync {
  fs: FsBridge
  drive: ClienteDrive
  /** `<appConfigDir>/cofres/<hash do caminho do cofre>`, de `diretorioDoManifesto`. */
  dirManifesto: string
  /** Raiz do cofre no disco. Os caminhos do plano são relativos a ela. */
  raizLocal: string
  /**
   * Executa AGORA as gravações debounced do app e devolve as que falharam.
   * Em produção é `useApp.getState().descarregarFilas`.
   */
  descarregarFilas(): Promise<FalhaDeGravacao[]>
  /** Varredura do cofre. `conhecidos` só serve para pular hash — ver `varrer.ts`. */
  varrerLocal(raiz: string, conhecidos: Record<string, EntradaArquivo>): Promise<Map<string, EstadoLocal>>
  /** Relê do disco o arquivo recém-baixado, para o manifesto guardar o que ficou lá. */
  sondarLocal(caminhoAbsoluto: string): Promise<EstadoLocal>
  /** Política de conflito por tipo de arquivo. Porta injetada — não é decisão deste ciclo. */
  preservarPerdedor(acao: AcaoConflito, remoto: EstadoRemoto | undefined): Promise<void>
  /** Instante do fim do ciclo, em ISO. */
  agora(): string
}

export type ResultadoDoCiclo =
  /** O plano rodou. `falhas` vazio = ciclo completo; com falhas o manifesto guarda só o que deu certo. */
  | { tipo: 'sincronizado'; manifesto: Manifesto; falhas: FalhaAcao[] }
  /** O freio de deleção em massa disparou. NADA foi executado; quem orquestra tem de perguntar. */
  | { tipo: 'freio'; apagaria: number; total: number }
  /** A fila do app não chegou ao disco. O cofre nem foi lido — sincronizar aqui subiria versão velha. */
  | { tipo: 'gravacaoPendente'; falhas: FalhaDeGravacao[] }
  /** Sem manifesto: este cofre nunca foi pareado com a nuvem. Parear é outra fatia (C2/C3). */
  | { tipo: 'naoPareado' }

/**
 * A listagem do Drive na forma que `reconciliar` espera.
 *
 * `hash ?? undefined` é a linha mais importante daqui. O Rust devolve `Option<String>` como `null`,
 * e `ladoRemoto` testa `atual.hash === undefined` para decidir se cai no plano B da `versaoRemota`.
 * Com `null` esse teste dá falso, a comparação vira `null === '<sha256>'`, todo arquivo sem checksum
 * lê como "mudou" e o cofre inteiro é baixado de novo a cada ciclo, para sempre.
 *
 * A ausência de `removido` é deliberada: `drive_listar` só enxerga arquivo vivo, então o que sumiu
 * do Drive simplesmente não vem na lista — e `reconciliar` lê ausência como apagado. Lápide só
 * existiria se o estado remoto viesse do `changes.list`, que é justamente o que este ciclo não faz.
 */
function estadoRemotoDe(conteudo: ConteudoRemoto): Map<string, EstadoRemoto> {
  return new Map(conteudo.arquivos.map((item): [string, EstadoRemoto] => [
    item.caminho,
    {
      fileId: item.fileId,
      hash: item.hash ?? undefined,
      versao: item.versao,
      // Atravessa intacto até `preservarPerdedor`, que assina com ele a cópia de conflito quando
      // quem perde é o lado remoto. Deixar cair aqui não quebraria sync nenhum — só faria toda
      // cópia vinda do outro computador ficar assinada como "outro computador".
      deviceNome: item.deviceNome ?? undefined,
    },
  ]))
}

function pastasRemotasDe(conteudo: ConteudoRemoto): Map<string, string> {
  return new Map(conteudo.pastas.map((pasta) => [pasta.caminho, pasta.fileId]))
}

/**
 * Promove o manifesto do ciclo ANTERIOR a cópia de segurança, antes de o novo ser gravado por
 * cima. A ordem é o que dá valor ao backup: rotacionar depois de gravar deixaria as duas cópias
 * idênticas, e a recuperação não teria para onde voltar.
 *
 * A falha não derruba o ciclo — e esta é a única exceção que este arquivo engole. Backup velho é
 * um caminho de recuperação degradado; manifesto novo perdido é trabalho perdido, com o ciclo
 * seguinte rederivando ações já executadas e podendo gerar cópias de conflito à toa. O caso real
 * de falha é benigno (o `manifesto.json` ainda não existe porque a leitura caiu na cópia anterior),
 * mas fica no log em vez de sumir.
 */
async function promoverBackup(deps: DependenciasDoSync): Promise<void> {
  try {
    await rotacionar(deps.dirManifesto, deps.fs)
  } catch (erro) {
    console.warn('Sync: não deu para guardar a cópia anterior do manifesto:', erro)
  }
}

export async function executarCiclo(deps: DependenciasDoSync): Promise<ResultadoDoCiclo> {
  const pendentes = await deps.descarregarFilas()
  // Parar aqui atrasa o sync em um ciclo e deixa a falha visível. Seguir subiria, com carimbo de
  // sincronizado no manifesto, um arquivo que o disco sabe estar velho.
  if (pendentes.length > 0) return { tipo: 'gravacaoPendente', falhas: pendentes }

  const anterior = await lerManifesto(deps.dirManifesto, deps.fs)
  if (anterior === null) return { tipo: 'naoPareado' }

  const local = await deps.varrerLocal(deps.raizLocal, anterior.arquivos)
  const conteudo = await deps.drive.listar(anterior.pastaRaizId)
  const remoto = estadoRemotoDe(conteudo)

  const plano = reconciliar(anterior, local, remoto)
  if (!plano.ok) return { tipo: 'freio', apagaria: plano.apagaria, total: plano.total }

  const resultado = await executarPlano(
    plano.acoes,
    { anterior, local, remoto, pastasRemotas: pastasRemotasDe(conteudo), raizLocal: deps.raizLocal },
    {
      drive: deps.drive,
      fs: deps.fs,
      sondarLocal: deps.sondarLocal,
      preservarPerdedor: deps.preservarPerdedor,
      agora: deps.agora,
    },
  )

  // Só ciclo COMPLETO promove backup: com ação falha o manifesto novo descreve um estado
  // parcialmente divergente, e guardá-lo como "último estado bom" apagaria o último que era.
  if (resultado.falhas.length === 0) await promoverBackup(deps)
  await gravarManifesto(deps.dirManifesto, resultado.manifesto, deps.fs)
  return { tipo: 'sincronizado', manifesto: resultado.manifesto, falhas: resultado.falhas }
}

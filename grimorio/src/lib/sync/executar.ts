import { normalizarCaminho } from '../cofres'
import type { FsBridge } from '../fsBridge'
import type { ClienteDrive } from './driveBridge'
import { reconstruirManifesto, type Desfecho, type EstadoPosCiclo } from './reconstruir'
import type { Acao, EstadoLocal, EstadoRemoto, Manifesto } from './tipos'

/**
 * Executor do plano de sync. `reconciliar` decide O QUÊ; `drive.rs` sabe COMO falar com o
 * Drive; este arquivo é a costura entre os dois, e é o único lugar do motor que toca rede e
 * disco.
 *
 * Duas escolhas carregam o arquivo:
 *
 * 1. **Uma ação que falha não derruba o ciclo.** Cada ação é isolada; a falha é coletada e o
 *    laço segue. Um arquivo travado pelo antivírus, um 403 de cota ou uma imagem que sumiu do
 *    disco não podem impedir os outros duzentos arquivos de sincronizar — e num cofre grande
 *    esse é o caso comum, não o excepcional.
 * 2. **O manifesto só registra o que aconteceu de verdade.** O que falhou fica marcado como
 *    falha e a reconstrução (`reconstruir.ts`) mantém a entrada anterior daquele caminho. É a
 *    metade mais perigosa desta peça: uma ação falha gravada como sucesso faria o ciclo
 *    seguinte concluir "já está sincronizado" e a divergência sumiria de vista para sempre.
 *
 * As ações rodam em SÉRIE, na ordem do plano. Paralelizar economizaria tempo de parede num
 * cofre grande, mas a ordem determinística é o que torna o executor testável de forma exata, e
 * a cota do Drive (325.000 unidades/min) não é o gargalo. Otimizar isso é para quando houver
 * medição, não antes.
 */

/** Um conflito com o vencedor já decidido pelo motor. */
export type AcaoConflito = Extract<Acao, { tipo: 'conflito' }>

export interface DependenciasDoCiclo {
  drive: ClienteDrive
  fs: FsBridge
  /**
   * Relê do disco o arquivo que ACABOU de ser baixado.
   *
   * Existe porque o manifesto tem de guardar o que ficou no disco, não o que o Drive prometeu
   * mandar: o `hash` do Drive é opcional e o `mtime` do arquivo recém-escrito é do sistema de
   * arquivos, não da resposta HTTP. Copiar os metadados remotos para o manifesto sem conferir
   * faria o ciclo seguinte ver "local mudou" e baixar de novo, para sempre.
   */
  sondarLocal(caminhoAbsoluto: string): Promise<EstadoLocal>
  /**
   * Põe o lado perdedor a salvo ANTES de o vencedor passar por cima dele.
   *
   * A política por tipo de arquivo — id novo e nome prefixado para entidade, união para
   * `vinculos.json`, sufixo para imagem — é outra fatia do spec e não mora aqui; este é o
   * ponto de costura onde ela entra. Preservar vem primeiro por necessidade: depois da
   * transferência não há mais perdedor para salvar.
   *
   * Limitação conhecida: se a preservação der certo e a transferência falhar, o conflito
   * continua de pé e o ciclo seguinte gera uma segunda cópia. O spec já aceita que cópias de
   * conflito se acumulem; sem transação não há como fazer os dois passos serem um só.
   */
  preservarPerdedor(acao: AcaoConflito, remoto: EstadoRemoto | undefined): Promise<void>
  /** Instante do fim do ciclo, em ISO. Injetado para o resultado não depender do relógio. */
  agora(): string
}

export interface EstadoDoCiclo {
  /** Manifesto do último sync bem-sucedido. */
  anterior: Manifesto
  /**
   * A MESMA varredura local e a MESMA listagem remota que geraram o plano — não uma releitura.
   * Executar um plano contra um estado diferente do que o produziu faz cada ação agir sobre
   * premissas que já não valem.
   */
  local: Map<string, EstadoLocal>
  remoto: Map<string, EstadoRemoto>
  /** caminho → fileId das pastas, como a listagem do Drive as viu agora. */
  pastasRemotas: Map<string, string>
  /** Raiz do cofre no disco. Os caminhos do plano são relativos a ela. */
  raizLocal: string
}

export interface FalhaAcao {
  acao: Acao
  erro: string
}

export interface ResultadoCiclo {
  /**
   * O manifesto do próximo ciclo. Gravar e rotacionar é do chamador: a rotação só pode
   * acontecer depois de um ciclo COMPLETO (`falhas` vazio), e essa é decisão de quem orquestra.
   */
  manifesto: Manifesto
  concluidas: Acao[]
  falhas: FalhaAcao[]
}

/** Contexto de uma passada, para não arrastar quatro parâmetros por cada ação. */
interface Ciclo {
  estado: EstadoDoCiclo
  deps: DependenciasDoCiclo
  resolverPasta(caminhoDaPasta: string): Promise<string>
}

/** Pasta-mãe de um caminho relativo canônico; `''` para arquivo na raiz do cofre. */
function pastaDe(caminho: string): string {
  const corte = caminho.lastIndexOf('/')
  return corte < 0 ? '' : caminho.slice(0, corte)
}

function nomeDe(caminho: string): string {
  return caminho.slice(caminho.lastIndexOf('/') + 1)
}

/**
 * Caminho no disco de um caminho relativo do cofre. A raiz vem do store, que a guarda com `/`,
 * mas normalizar aqui é barato e o erro que ele evita é caro: `C:\Cofre` + `/` + `a/b.json`
 * daria um caminho misto que o Rust até abre, e que a `sondarLocal` seguinte não reencontra.
 */
export function caminhoAbsoluto(raizLocal: string, caminho: string): string {
  return `${normalizarCaminho(raizLocal).replace(/\/+$/, '')}/${caminho}`
}

/**
 * Erro do Tauri vira texto legível. `invoke` rejeita com a STRING que o `Result::Err` do Rust
 * devolveu — não com um `Error` —, então `erro.message` daria `undefined` em todo erro vindo
 * do Drive, que é justamente a categoria que o usuário precisa ler.
 */
export function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

function exigirLocal(caminho: string, ciclo: Ciclo): EstadoLocal {
  const local = ciclo.estado.local.get(caminho)
  if (local === undefined) throw new Error(`${caminho} não está mais na varredura local`)
  return local
}

/** O arquivo no Drive, exigindo que ele esteja VIVO — lápide não tem id utilizável. */
function exigirRemotoVivo(caminho: string, ciclo: Ciclo): EstadoRemoto {
  const remoto = ciclo.estado.remoto.get(caminho)
  if (remoto === undefined || remoto.removido) {
    throw new Error(`${caminho} não está mais no Google Drive`)
  }
  return remoto
}

/**
 * Id a substituir no envio, ou `null` para criar um arquivo novo.
 *
 * Só id de arquivo VIVO conta, e a distinção não é cosmética. O caso `mudou × apagado` da
 * matriz manda `subir` justamente sobre um caminho cujo remoto tem lápide: reaproveitar aquele
 * id faria um PATCH num arquivo que está na lixeira do Drive. O PATCH dá 200, o upload "dá
 * certo", e o arquivo continua na lixeira — some da listagem seguinte (que filtra
 * `trashed = false`) e o ciclo seguinte manda subir de novo, para sempre. Falha silenciosa e
 * eterna. Idem para id vindo do manifesto velho, que aponta para um arquivo que pode ter sido
 * apagado de vez: aí o PATCH dá 404 e o envio se perde.
 */
function idParaSubstituir(caminho: string, ciclo: Ciclo): string | null {
  const remoto = ciclo.estado.remoto.get(caminho)
  return remoto === undefined || remoto.removido ? null : remoto.fileId
}

/**
 * Sobe o arquivo local.
 *
 * O `hash` gravado é o da varredura LOCAL, e não o `sha256Checksum` que o Drive devolveu, por
 * uma assimetria do motor: o lado remoto tem plano B (`versaoRemota`) quando o Drive não sabe
 * o checksum, e o lado local não tem nenhum — se o hash do manifesto não for o do arquivo em
 * disco, toda varredura seguinte lê "local mudou" e reenvia o cofre inteiro.
 */
async function subir(caminho: string, ciclo: Ciclo): Promise<Desfecho> {
  const local = exigirLocal(caminho, ciclo)
  const pastaId = await ciclo.resolverPasta(pastaDe(caminho))
  const enviado = await ciclo.deps.drive.enviar({
    pastaId,
    nome: nomeDe(caminho),
    caminhoLocal: caminhoAbsoluto(ciclo.estado.raizLocal, caminho),
    fileId: idParaSubstituir(caminho, ciclo),
    deviceNome: ciclo.estado.anterior.deviceNome,
  })
  return {
    fileId: enviado.fileId,
    hash: local.hash,
    tamanho: local.tamanho,
    mtimeLocal: local.mtime,
    versaoRemota: enviado.versao,
  }
}

/** Baixa por cima do arquivo local e registra o que REALMENTE ficou no disco. */
async function baixar(caminho: string, ciclo: Ciclo): Promise<Desfecho> {
  const remoto = exigirRemotoVivo(caminho, ciclo)
  const destino = caminhoAbsoluto(ciclo.estado.raizLocal, caminho)
  await ciclo.deps.drive.baixar(remoto.fileId, destino)
  const depois = await ciclo.deps.sondarLocal(destino)
  return {
    fileId: remoto.fileId,
    hash: depois.hash,
    tamanho: depois.tamanho,
    mtimeLocal: depois.mtime,
    versaoRemota: remoto.versao,
  }
}

/**
 * Apaga o arquivo local. Pastas que ficarem vazias continuam lá: a varredura só enxerga
 * arquivos, e remover diretório por conta própria arriscaria levar junto algo que o sync não
 * conhece.
 */
async function apagarLocal(caminho: string, ciclo: Ciclo): Promise<Desfecho> {
  await ciclo.deps.fs.removePath(caminhoAbsoluto(ciclo.estado.raizLocal, caminho))
  return null
}

async function apagarRemoto(caminho: string, ciclo: Ciclo): Promise<Desfecho> {
  await ciclo.deps.drive.apagar(exigirRemotoVivo(caminho, ciclo).fileId)
  return null
}

/**
 * Não transfere nada — os dois lados já têm o mesmo conteúdo e só falta o manifesto saber.
 * É o que impede um cofre inteiro de subir de novo quando o usuário pareia um segundo PC que
 * já tem uma cópia idêntica.
 */
function registrar(caminho: string, ciclo: Ciclo): Desfecho {
  const local = exigirLocal(caminho, ciclo)
  const remoto = exigirRemotoVivo(caminho, ciclo)
  return {
    fileId: remoto.fileId,
    hash: local.hash,
    tamanho: local.tamanho,
    mtimeLocal: local.mtime,
    versaoRemota: remoto.versao,
  }
}

/** Salva o perdedor e depois converge para o vencedor, que é uma subida ou uma descida comum. */
async function resolverConflito(acao: AcaoConflito, ciclo: Ciclo): Promise<Desfecho> {
  await ciclo.deps.preservarPerdedor(acao, ciclo.estado.remoto.get(acao.caminho))
  return acao.vencedor === 'local' ? subir(acao.caminho, ciclo) : baixar(acao.caminho, ciclo)
}

function aplicar(acao: Acao, ciclo: Ciclo): Promise<Desfecho> {
  switch (acao.tipo) {
    case 'subir':
      return subir(acao.caminho, ciclo)
    case 'baixar':
      return baixar(acao.caminho, ciclo)
    case 'apagarLocal':
      return apagarLocal(acao.caminho, ciclo)
    case 'apagarRemoto':
      return apagarRemoto(acao.caminho, ciclo)
    case 'registrar':
      return Promise.resolve(registrar(acao.caminho, ciclo))
    case 'conflito':
      return resolverConflito(acao, ciclo)
  }
}

interface ResolvedorDePastas {
  resolver(caminhoDaPasta: string): Promise<string>
  /** Tudo que se sabe sobre pastas ao fim do ciclo: a listagem mais o que foi criado. */
  conhecidas(): Map<string, string>
}

/**
 * Resolve o id da pasta de destino, criando a cadeia que faltar.
 *
 * Três decisões:
 *
 * - **Um segmento por chamada, com o prefixo memoizado.** `drive_garantir_pasta` aceita um
 *   caminho inteiro, mas descer segmento a segmento faz `campanhas/a` e `campanhas/b`
 *   compartilharem a busca de `campanhas`, e deixa todos os ids intermediários no mapa que vai
 *   para o manifesto.
 * - **Só a listagem de agora semeia o cache.** Ids de pasta do manifesto velho ficam de fora
 *   de propósito: a pasta pode ter ido para a lixeira desde o último ciclo, e enviar para uma
 *   pasta na lixeira deposita o arquivo lá dentro sem erro nenhum.
 * - **A promessa fica no cache mesmo quando falha.** Se a pasta não pôde ser criada, os
 *   duzentos arquivos que iriam para dentro dela falham na mesma rejeição em vez de gerar
 *   duzentas chamadas condenadas. O ciclo seguinte tenta de novo do zero.
 */
function criarResolvedorDePastas(
  drive: ClienteDrive,
  raizId: string,
  remotas: Map<string, string>,
): ResolvedorDePastas {
  const conhecidas = new Map(remotas)
  const emVoo = new Map<string, Promise<string>>()

  async function criar(caminho: string): Promise<string> {
    const maeId = await resolver(pastaDe(caminho))
    const id = await drive.garantirPasta(maeId, nomeDe(caminho))
    conhecidas.set(caminho, id)
    return id
  }

  // Recursiva pelo prefixo, que encurta a cada volta até chegar em `''` — a raiz do cofre.
  function resolver(caminhoDaPasta: string): Promise<string> {
    if (caminhoDaPasta === '') return Promise.resolve(raizId)
    const jaConhecida = conhecidas.get(caminhoDaPasta)
    if (jaConhecida !== undefined) return Promise.resolve(jaConhecida)
    const emAndamento = emVoo.get(caminhoDaPasta)
    if (emAndamento !== undefined) return emAndamento
    const pedido = criar(caminhoDaPasta)
    emVoo.set(caminhoDaPasta, pedido)
    return pedido
  }

  return { resolver, conhecidas: () => conhecidas }
}

/**
 * Aplica o plano e devolve o manifesto do próximo ciclo junto com o que falhou.
 *
 * Recebe `Acao[]`, e não `Plano`: a recusa por deleção em massa é decisão de produto
 * (perguntar ao usuário) e quem orquestra tem de abri-la explicitamente. Um executor que
 * aceitasse a recusa teria de escolher em silêncio entre ignorá-la e não fazer nada.
 */
export async function executarPlano(
  acoes: Acao[],
  estado: EstadoDoCiclo,
  deps: DependenciasDoCiclo,
): Promise<ResultadoCiclo> {
  const pastas = criarResolvedorDePastas(deps.drive, estado.anterior.pastaRaizId, estado.pastasRemotas)
  const ciclo: Ciclo = { estado, deps, resolverPasta: pastas.resolver }

  const concluidos = new Map<string, Desfecho>()
  const falhados = new Set<string>()
  const concluidas: Acao[] = []
  const falhas: FalhaAcao[] = []

  for (const acao of acoes) {
    try {
      concluidos.set(acao.caminho, await aplicar(acao, ciclo))
      concluidas.push(acao)
    } catch (erro) {
      falhados.add(acao.caminho)
      falhas.push({ acao, erro: mensagemDeErro(erro) })
    }
  }

  const posCiclo: EstadoPosCiclo = {
    anterior: estado.anterior,
    local: estado.local,
    remoto: estado.remoto,
    concluidos,
    falhados,
  }
  return {
    manifesto: reconstruirManifesto(posCiclo, pastas.conhecidas(), deps.agora()),
    concluidas,
    falhas,
  }
}

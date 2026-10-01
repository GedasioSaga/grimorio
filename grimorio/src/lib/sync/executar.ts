import { normalizarCaminho } from '../cofres'
import type { FsBridge } from '../fsBridge'
import { apurarCitacoes, type CitacoesApuradas } from '../organizarImagens/citacoes'
import { chaveCaminho, ehImagem } from '../organizarImagens/nomes'
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
 *
 * Duas exceções à ordem do plano, as duas com IMAGEM — o arquivo que as fichas citam pelo caminho.
 *
 * 1. `apagarLocal` de imagem roda depois das outras ações. Antes de apagar, o executor pergunta a
 *    `apurarCitacoes` (a leitura do "Organizar imagens") se alguma ficha, mapa ou nota do cofre
 *    ainda cita a imagem — já com as descidas deste ciclo no disco, porque é a ficha baixada agora
 *    que diz se a citação velha ainda vale. O caso real: o outro PC organizou as imagens enquanto
 *    este editava offline uma ficha que cita o caminho velho; a ficha deste PC vence o conflito, e
 *    apagar a imagem a deixaria citando um arquivo que não existe mais.
 *
 *    - Ninguém cita: apaga, como qualquer `apagarLocal`.
 *    - Um arquivo LIDO cita: a imagem volta a subir. O remoto é lápide ou não existe, então o envio
 *      cria um arquivo novo, o manifesto o registra e o ciclo seguinte vê `igual × igual` — sem laço.
 *    - Quem cita falhou neste ciclo, algum `.json` não deu para ler, ou a checagem não pôde rodar:
 *      vira falha "adiado", a entrada anterior fica e o ciclo seguinte refaz a conta. Subir na
 *      dúvida, como o organizador faz, aqui não serve: um arquivo travado por um instante
 *      devolveria ao Drive, imagem por imagem, a organização inteira do outro PC.
 *
 *    A conta usa a varredura do começo do ciclo, mais o que desceu e menos o que foi apagado, em vez
 *    de listar o cofre de novo (`arquivosDepoisDasAcoes`). Fichas na `.lixeira` e JSON que não
 *    parseia, mas tem o caminho no texto, continuam protegendo a imagem.
 *
 * 2. `apagarRemoto` de imagem roda por último de tudo, e só se as fichas deste PC e a imagem nova
 *    chegaram ao Drive. O caso real é o avesso do de cima: ESTE PC organizou, e o Drive ainda tem a
 *    ficha velha, que cita a imagem velha. Duas falhas seguram o apagar, que vira "adiado" e o ciclo
 *    seguinte tenta de novo:
 *
 *    - Uma ação que levaria um `.json` do Drive ao estado deste PC (`ACOES_QUE_LEVAM_FICHA`). Apagar
 *      a imagem lá antes de a ficha nova subir — ou com a subida falhando — deixa o Drive citando um
 *      arquivo que não existe; o outro PC, cuja ficha ainda cita a imagem velha, a sobe de volta, e
 *      ela vira órfã duplicada quando a ficha nova enfim chega. Segura TODO apagar de imagem: este PC
 *      não sabe o que a ficha de lá cita.
 *    - A subida de uma imagem com o MESMO conteúdo (`ACOES_QUE_LEVAM_IMAGEM`). O organizador copia os
 *      bytes para o endereço novo, então o hash da imagem nova é o que o manifesto guarda para a velha.
 *      Com a ficha nova lá e a imagem nova de fora, o outro PC baixa a ficha, não vê mais ninguém
 *      citando a velha e a apaga do disco: o conteúdo ficaria só neste disco e na lixeira do Drive.
 *      Segura só as velhas daquele hash, porque aqui o conteúdo é conhecido — e segurar tudo deixaria
 *      uma imagem travada prender no Drive as velhas de um cofre inteiro organizado. Custo aceito: o
 *      outro PC fica sem a imagem nova até ela subir, porque a ficha que a cita já chegou; a velha
 *      continua lá e no disco dele.
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
  return `${raizCanonica(raizLocal)}/${caminho}`
}

/** A raiz com `/` e sem barra no fim — a forma que `caminhoAbsoluto` e `quemCita` concatenam. */
function raizCanonica(raizLocal: string): string {
  return normalizarCaminho(raizLocal).replace(/\/+$/, '')
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
 *
 * A guarda de divergência é o que torna esse hash confiável: o envio lê o arquivo do DISCO na
 * hora, e sem a guarda ele subia bytes mais novos que a varredura com o hash velho no manifesto.
 * O ciclo seguinte lia "local mudou × remoto mudou" num arquivo que só ESTA máquina editou e
 * fabricava uma cópia de conflito — a cada ciclo, enquanto o usuário estivesse editando (o
 * autosave do canvas grava fora de `descarregarFilas`).
 */
async function subir(caminho: string, ciclo: Ciclo): Promise<Desfecho> {
  const local = exigirLocal(caminho, ciclo)
  if (await arquivoDivergiuDoSnapshot(caminho, ciclo)) throw erroDeDivergencia(caminho)
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

/**
 * O arquivo no disco mudou depois da varredura que gerou este plano?
 *
 * O ciclo inteiro (rede + N ações em série) dura bem mais que os 800 ms de debounce do autosave
 * do app: uma edição feita pelo usuário DURANTE o ciclo não entra no plano, que foi derivado de
 * um snapshot mais velho. Sem esta checagem, `baixar`/`apagarLocal` sobrescreveriam essa edição
 * em silêncio — nem conflito, nem aviso.
 *
 * Só reler quando o arquivo EXISTE agora: se ele não está no disco, não há edição local a
 * proteger (é o caso comum de uma descida nova, sem entrada na varredura). Isto também evita
 * comparar contra um snapshot que nunca teve o arquivo fisicamente presente no fake de teste.
 */
async function arquivoDivergiuDoSnapshot(caminho: string, ciclo: Ciclo): Promise<boolean> {
  const destino = caminhoAbsoluto(ciclo.estado.raizLocal, caminho)
  if (!(await ciclo.deps.fs.exists(destino))) return false
  const snapshot = ciclo.estado.local.get(caminho)
  if (snapshot === undefined) return true
  const agora = await ciclo.deps.sondarLocal(destino)
  return agora.hash !== snapshot.hash
}

function erroDeDivergencia(caminho: string): Error {
  return new Error(`${caminho} mudou no disco durante o ciclo — adiado para a próxima rodada`)
}

/** Baixa por cima do arquivo local e registra o que REALMENTE ficou no disco. */
async function baixar(caminho: string, ciclo: Ciclo): Promise<Desfecho> {
  const remoto = exigirRemotoVivo(caminho, ciclo)
  if (await arquivoDivergiuDoSnapshot(caminho, ciclo)) throw erroDeDivergencia(caminho)
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
  if (await arquivoDivergiuDoSnapshot(caminho, ciclo)) throw erroDeDivergencia(caminho)
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

/**
 * Salva o perdedor e depois converge para o vencedor, que é uma subida ou uma descida comum.
 *
 * A checagem de divergência vem ANTES da preservação: adiar depois de preservar deixaria o
 * conflito de pé E uma cópia nova no cofre a cada ciclo — com o usuário editando o arquivo, a
 * sidebar enchia de "(conflito) …" idênticos. Adiado antes, o ciclo seguinte refaz a conta com
 * a varredura fresca e preserva UMA vez.
 */
async function resolverConflito(acao: AcaoConflito, ciclo: Ciclo): Promise<Desfecho> {
  if (await arquivoDivergiuDoSnapshot(acao.caminho, ciclo)) throw erroDeDivergencia(acao.caminho)
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

/** O que a passada já apurou: o desfecho de quem concluiu e o que falhou. */
interface Registro {
  concluidos: Map<string, Desfecho>
  falhados: Set<string>
  concluidas: Acao[]
  falhas: FalhaAcao[]
}

function registrarFalha(registro: Registro, acao: Acao, erro: string): void {
  registro.falhados.add(acao.caminho)
  registro.falhas.push({ acao, erro })
}

/** Roda um passo isolado: o sucesso vira desfecho, a falha vira item de `falhas` e o ciclo segue. */
async function tentar(acao: Acao, passo: () => Promise<Desfecho>, registro: Registro): Promise<void> {
  try {
    registro.concluidos.set(acao.caminho, await passo())
    registro.concluidas.push(acao)
  } catch (erro) {
    registrarFalha(registro, acao, mensagemDeErro(erro))
  }
}

/**
 * Junta as citações por chave de comparação. `quemCita` credita só o último `rel` de chaves
 * iguais (a mesma imagem em NFC e em NFD, ou com caixa diferente); sem juntar, a outra grafia
 * sairia "sem citação" e seria apagada.
 */
function citantesPorChave(citacoes: Map<string, string[]>): Map<string, string[]> {
  const porChave = new Map<string, string[]>()
  for (const [rel, citantes] of citacoes) {
    const chave = chaveCaminho(rel)
    porChave.set(chave, [...(porChave.get(chave) ?? []), ...citantes])
  }
  return porChave
}

function adiado(motivo: string): string {
  return `${motivo} — adiado para a próxima rodada`
}

function ehJson(caminho: string): boolean {
  return caminho.toLowerCase().endsWith('.json')
}

/**
 * Ações que, falhando com um `.json`, deixam no Drive uma ficha diferente da deste PC — e a de lá
 * pode citar a imagem que este PC tirou do lugar. `baixar` fica de fora: a ficha que não desceu é a
 * que JÁ está no Drive, e o apagar da imagem não muda o que ela cita.
 */
const ACOES_QUE_LEVAM_FICHA: ReadonlySet<Acao['tipo']> = new Set(['subir', 'conflito', 'apagarRemoto'])

/**
 * Ações que, falhando com uma imagem, deixam fora do Drive um conteúdo que só este PC tem — e pode ser o
 * da imagem velha que o plano manda apagar lá. `conflito` entra pelos dois vencedores, como em
 * `ACOES_QUE_LEVAM_FICHA`: na dúvida, a velha fica.
 */
const ACOES_QUE_LEVAM_IMAGEM: ReadonlySet<Acao['tipo']> = new Set(['subir', 'conflito'])

/**
 * Os arquivos do cofre como as outras ações os deixaram, sem listar o disco de novo: a varredura do
 * começo do ciclo, mais o que desceu, menos o que foi apagado. `undefined` quando a conta não fecha —
 * conflito de `.json` grava uma cópia do perdedor cujo caminho só `preservarPerdedor` conhece, e aí só
 * listando o cofre.
 *
 * Mover uma ficha, ou mandá-la para a lixeira, no meio do ciclo tira o caminho velho do disco, e ele
 * cai em ilegível: adia. Custo aceito: um `.json` NOVO, criado no meio do ciclo citando uma imagem
 * que já existe, só entra na conta da próxima varredura. A listagem tinha a mesma janela (da checagem
 * ao apagar), só que mais curta; e o app não cria ficha nova citando imagem antiga — transformar
 * imagem em entidade copia o arquivo.
 */
function arquivosDepoisDasAcoes(plano: Acao[], ciclo: Ciclo, registro: Registro): string[] | undefined {
  if (plano.some((a) => a.tipo === 'conflito' && ehJson(a.caminho))) return undefined
  const arquivos = new Set(ciclo.estado.local.keys())
  for (const acao of registro.concluidas) {
    if (acao.tipo === 'baixar') arquivos.add(acao.caminho)
    if (acao.tipo === 'apagarLocal') arquivos.delete(acao.caminho)
  }
  return [...arquivos]
}

/**
 * As imagens que o plano manda apagar do disco, conferidas contra o cofre como ele ficou depois de
 * todas as outras ações (o porquê está no cabeçalho).
 */
async function apagarImagensSemCitacao(acoes: Acao[], plano: Acao[], ciclo: Ciclo, registro: Registro): Promise<void> {
  if (acoes.length === 0) return
  let apuradas: CitacoesApuradas
  try {
    const raiz = raizCanonica(ciclo.estado.raizLocal)
    const rels = acoes.map((a) => a.caminho)
    apuradas = await apurarCitacoes(raiz, ciclo.deps.fs, rels, arquivosDepoisDasAcoes(plano, ciclo, registro))
  } catch (erro) {
    const motivo = mensagemDeErro(erro)
    for (const acao of acoes) {
      registrarFalha(registro, acao, adiado(`não deu para conferir se alguma ficha ainda cita ${acao.caminho} (${motivo})`))
    }
    return
  }
  const citacoes = citantesPorChave(apuradas.citantes)
  // Um ilegível pode citar qualquer imagem; basta um para nenhuma sem citação lida poder ser apagada.
  const ilegivel: string | undefined = apuradas.ilegiveis[0]
  // Quem falhou neste ciclo ainda tem no disco a versão de antes, que pode não ser a que vai valer.
  const pendentes = new Set([...registro.falhados].map(chaveCaminho))
  for (const acao of acoes) {
    const citantes = citacoes.get(chaveCaminho(acao.caminho))
    if (citantes === undefined) {
      // `apurarCitacoes` responde por todo `rel` pedido; sem resposta, na dúvida a imagem fica.
      registrarFalha(registro, acao, adiado(`não deu para conferir se alguma ficha ainda cita ${acao.caminho}`))
      continue
    }
    if (citantes.length === 0) {
      if (ilegivel === undefined) await tentar(acao, () => apagarLocal(acao.caminho, ciclo), registro)
      else registrarFalha(registro, acao, adiado(`não deu para ler ${ilegivel}, que pode citar ${acao.caminho}`))
      continue
    }
    const pendente = citantes.find((c) => pendentes.has(chaveCaminho(c)))
    if (pendente !== undefined) {
      registrarFalha(registro, acao, adiado(`${acao.caminho} ainda é citada por ${pendente}, que não sincronizou neste ciclo`))
      continue
    }
    await tentar({ tipo: 'subir', caminho: acao.caminho }, () => subir(acao.caminho, ciclo), registro)
  }
}

/**
 * A imagem em `caminho`, que não subiu neste ciclo, pode ter o conteúdo de `hash`? Sem um dos dois
 * hashes não há como provar que é outro conteúdo, e na dúvida a imagem velha fica no Drive.
 */
function podeTerOConteudo(caminho: string, hash: string | undefined, ciclo: Ciclo): boolean {
  const daQueFicou = ciclo.estado.local.get(caminho)?.hash
  return hash === undefined || daQueFicou === undefined || daQueFicou === hash
}

/**
 * O último passo do ciclo: as imagens que o plano manda apagar no Drive, depois de todo o resto e só
 * se nenhuma ficha deixou de chegar lá como está neste PC, nem a imagem com o mesmo conteúdo (o porquê
 * está no cabeçalho).
 */
async function apagarImagensDoDrive(acoes: Acao[], ciclo: Ciclo, registro: Registro): Promise<void> {
  if (acoes.length === 0) return
  const fichaQueFicou = registro.falhas.find((f) => ACOES_QUE_LEVAM_FICHA.has(f.acao.tipo) && ehJson(f.acao.caminho))
  const imagensQueFicaram = registro.falhas.filter((f) => ACOES_QUE_LEVAM_IMAGEM.has(f.acao.tipo) && ehImagem(f.acao.caminho))
  // Map, e não índice no objeto, pela convenção de `reconciliar`: nenhum caminho acha o protótipo.
  const anteriores = new Map(Object.entries(ciclo.estado.anterior.arquivos))
  for (const acao of acoes) {
    const hash = anteriores.get(acao.caminho)?.hash
    const novaQueFicou = imagensQueFicaram.find((f) => podeTerOConteudo(f.acao.caminho, hash, ciclo))
    if (novaQueFicou !== undefined) {
      const nova = novaQueFicou.acao.caminho
      registrarFalha(registro, acao, adiado(`${acao.caminho} só sai do Google Drive depois que ${nova}, que tem o mesmo conteúdo, chegar lá`))
      continue
    }
    if (fichaQueFicou === undefined) {
      await tentar(acao, () => apagarRemoto(acao.caminho, ciclo), registro)
      continue
    }
    const ficha = fichaQueFicou.acao.caminho
    const motivo = `${acao.caminho} só sai do Google Drive depois que ${ficha} ficar lá como está aqui`
    registrarFalha(registro, acao, adiado(`${motivo}, porque a de lá ainda pode citá-la`))
  }
}

/**
 * Aplica o plano e devolve o manifesto do próximo ciclo junto com o que falhou.
 *
 * Recebe `Acao[]`, e não `Plano`: a recusa por deleção em massa é decisão de produto
 * (perguntar ao usuário) e quem orquestra tem de abri-la explicitamente. Um executor que
 * aceitasse a recusa teria de escolher em silêncio entre ignorá-la e não fazer nada.
 *
 * Imagem sai da ordem do plano (ver o cabeçalho): `apagarLocal` roda depois das outras ações e
 * pode virar `subir` ou falha "adiado"; `apagarRemoto` roda por último e pode virar "adiado", por
 * ficha que não chegou ao Drive ou por imagem de mesmo conteúdo que não subiu.
 */
export async function executarPlano(
  acoes: Acao[],
  estado: EstadoDoCiclo,
  deps: DependenciasDoCiclo,
): Promise<ResultadoCiclo> {
  const pastas = criarResolvedorDePastas(deps.drive, estado.anterior.pastaRaizId, estado.pastasRemotas)
  const ciclo: Ciclo = { estado, deps, resolverPasta: pastas.resolver }
  const registro: Registro = { concluidos: new Map(), falhados: new Set(), concluidas: [], falhas: [] }

  const imagensAApagar: Acao[] = []
  const imagensATirarDoDrive: Acao[] = []
  for (const acao of acoes) {
    if (acao.tipo === 'apagarLocal' && ehImagem(acao.caminho)) {
      imagensAApagar.push(acao)
      continue
    }
    if (acao.tipo === 'apagarRemoto' && ehImagem(acao.caminho)) {
      imagensATirarDoDrive.push(acao)
      continue
    }
    await tentar(acao, () => aplicar(acao, ciclo), registro)
  }
  await apagarImagensSemCitacao(imagensAApagar, acoes, ciclo, registro)
  await apagarImagensDoDrive(imagensATirarDoDrive, ciclo, registro)

  const posCiclo: EstadoPosCiclo = {
    anterior: estado.anterior,
    local: estado.local,
    remoto: estado.remoto,
    concluidos: registro.concluidos,
    falhados: registro.falhados,
  }
  return {
    manifesto: reconstruirManifesto(posCiclo, pastas.conhecidas(), deps.agora()),
    concluidas: registro.concluidas,
    falhas: registro.falhas,
  }
}

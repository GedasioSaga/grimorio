import { PASTA_IMAGENS, chaveCaminho, ehImagem } from '../organizarImagens/nomes'
import { politicaDoCaminho } from './conflito'
import type { Acao, EntradaArquivo, EstadoLocal, EstadoRemoto, Manifesto, Plano } from './tipos'

/**
 * Motor de reconciliação. Função PURA: manifesto + estado local + estado remoto entram, um
 * plano sai. Sem I/O, sem rede, sem Tauri, sem relógio — é isso que torna a lógica mais
 * arriscada do sync testável sem credencial, antes de existir qualquer cliente do Drive.
 *
 * A regra que governa o arquivo inteiro: **cada lado é comparado contra o MANIFESTO, nunca
 * contra o outro lado**. A pergunta é "mudou desde o último sync?" e não "quem tem a data
 * maior?" — e é essa distinção que impede um arquivo apagado de ressuscitar a cada ciclo pelo
 * lado que ainda o tem. Mesmo desenho que o rclone chama de `.lst` e o Unison de archive.
 */

/** Como UM lado está em relação ao manifesto. Nunca em relação ao outro lado. */
type Lado = 'igual' | 'mudou' | 'apagado'

/** Célula da matriz: um tipo de ação, ou a ausência dela. */
type Celula = Acao['tipo'] | 'nada'

/** Acima desta fração de deleções sobre o total conhecido, o motor se recusa a agir. */
const LIMITE_DELECAO = 0.5

/**
 * Abaixo deste número de arquivos conhecidos o freio nem engata. Percentual não significa nada
 * com N pequeno: num cofre de dois arquivos, apagar um já é 50%. E um freio que grita à toa é um
 * freio que o usuário aprende a confirmar sem ler — o que destrói o valor da única vez em que ele
 * importa. O freio existe para pegar falha SISTEMÁTICA (uma pasta que não montou, um caminho que
 * mudou) em que o motor conclui que tudo sumiu: num cofre de 500 arquivos isso é catastrófico e
 * irrecuperável à mão; num de três, não é nem uma coisa nem outra.
 */
const MINIMO_PARA_FREIO = 10

/**
 * Vencedor de conflito quando não há como (ou não faz sentido) comparar datas: vence o local,
 * que é o lado cuja edição o usuário acabou de ver na tela. Ver `decidirVencedor` para a exceção
 * — política `metadado`, onde vence a mais recente.
 */
const VENCEDOR_PROVISORIO = 'local' as const

/**
 * Acima deste intervalo entre os dois `modificadoEm`, um lado é considerado mais novo que o
 * outro de verdade. Abaixo, os relógios de duas máquinas — que não são sincronizados entre si —
 * não permitem provar qual foi de fato a edição mais recente, e a dúvida resolve para o
 * `VENCEDOR_PROVISORIO`.
 */
const LIMIAR_CLOCK_SKEW_MS = 2_000

/**
 * Vencedor de um conflito de política `metadado` (`campanha.json`, `pasta.json`, `cofre.json`):
 * vence a edição mais recente, e não sempre o local. As demais políticas preservam o perdedor
 * como cópia — não precisam saber qual lado é mais novo, e continuam no `VENCEDOR_PROVISORIO`.
 *
 * Exige os dois tempos. Sem `modificadoEm` do Drive (arquivo enviado antes deste campo existir,
 * ou `Date.parse` de um ISO inválido) não há como provar que o remoto é mais novo, e inventar
 * uma resposta destruiria a edição do usuário com base em nada.
 */
function decidirVencedor(
  caminho: string,
  atualLocal: EstadoLocal | undefined,
  atualRemoto: EstadoRemoto | undefined,
): 'local' | 'remoto' {
  if (politicaDoCaminho(caminho) !== 'metadado') return VENCEDOR_PROVISORIO
  if (atualLocal === undefined || atualRemoto?.modificadoEm === undefined) return VENCEDOR_PROVISORIO
  const remotoMaisNovoPor = atualRemoto.modificadoEm - atualLocal.mtime
  return remotoMaisNovoPor > LIMIAR_CLOCK_SKEW_MS ? 'remoto' : VENCEDOR_PROVISORIO
}

/**
 * Matriz para arquivos COM entrada no manifesto. Duas células parecem arbitrárias e não são:
 * `mudou × apagado` e `apagado × mudou` resolvem a favor da edição, porque recriar um arquivo
 * que o usuário acabou de editar é recuperável e descartar a edição dele em silêncio não é.
 *
 * `apagado × apagado` é `'nada'`, e é correto **porque o executor reescreve o manifesto inteiro a
 * partir do estado pós-ciclo** (ver "Contrato do manifesto" no design), em vez de editá-lo entrada
 * por entrada: o caminho simplesmente não aparece no manifesto novo. `Acao` não tem — e não
 * precisa ter — um verbo `esquecer`.
 *
 * Se um dia o manifesto passar a ser editado incrementalmente, esta célula vira um bug: a entrada
 * viveria para sempre e inflaria `total`, que é o denominador do freio. Vinte arquivos reais mais
 * duzentos fantasmas fariam uma falha sistemática de vinte arquivos medir 9% e nunca frear.
 */
const MATRIZ_CONHECIDO: Record<Lado, Record<Lado, Celula>> = {
  //         remoto igual        remoto mudou       remoto apagado
  igual: { igual: 'nada', mudou: 'baixar', apagado: 'apagarLocal' },
  mudou: { igual: 'subir', mudou: 'conflito', apagado: 'subir' },
  apagado: { igual: 'apagarRemoto', mudou: 'baixar', apagado: 'nada' },
}

/**
 * Estado do lado local contra o manifesto. Recebe só a entrada e o estado local de propósito:
 * não tendo acesso ao remoto, esta função é incapaz de violar a regra de ouro.
 */
function ladoLocal(entrada: EntradaArquivo, atual: EstadoLocal | undefined): Lado {
  if (atual === undefined) return 'apagado'
  return atual.hash === entrada.hash ? 'igual' : 'mudou'
}

/**
 * Idem para o lado remoto. `removido` cobre deleção E perda de acesso — a API não distingue.
 *
 * `fileId` fica fora da comparação de propósito: um arquivo recriado no Drive ganha id novo sem
 * que o conteúdo tenha mudado, e como o manifesto é reescrito por inteiro a cada ciclo, o id novo
 * já entra gravado no fim deste — não há nada a reconciliar.
 */
function ladoRemoto(entrada: EntradaArquivo, atual: EstadoRemoto | undefined): Lado {
  if (atual === undefined || atual.removido) return 'apagado'
  // `hash` é opcional no Drive. Quando falta, `versaoRemota` é exatamente o que o manifesto
  // guardou para responder "mudou?" sem hash. Assumir 'mudou' aqui baixaria o arquivo a cada
  // ciclo, para sempre.
  if (atual.hash === undefined) return atual.versao === entrada.versaoRemota ? 'igual' : 'mudou'
  return atual.hash === entrada.hash ? 'igual' : 'mudou'
}

/** Converte a célula da matriz em ação. `'nada'` vira `null` — nunca um `undefined` na lista. */
function montarAcao(celula: Celula, caminho: string, vencedor: 'local' | 'remoto'): Acao | null {
  if (celula === 'nada') return null
  if (celula === 'conflito') return { tipo: celula, caminho, vencedor }
  return { tipo: celula, caminho }
}

/**
 * Os dois lados mudaram desde o último sync, mas convergiram para conteúdo IDÊNTICO — a mesma
 * edição feita nas duas máquinas, ou o mesmo arquivo chegando pelos dois caminhos. Não há nada
 * a reconciliar, e uma cópia de conflito aqui seria puro lixo no cofre do usuário.
 *
 * Isto não fura a regra de ouro: a derivação contra o manifesto já aconteceu, e esta comparação
 * só consegue REBAIXAR um conflito já detectado — nunca inventar uma mudança.
 *
 * Exige os DOIS hashes. Sem o hash remoto não há prova de convergência, e o caso cai no
 * conflito normal.
 */
function convergiram(atualLocal: EstadoLocal | undefined, atualRemoto: EstadoRemoto | undefined): boolean {
  if (atualLocal === undefined || atualRemoto === undefined || atualRemoto.hash === undefined) return false
  return atualRemoto.hash === atualLocal.hash
}

/**
 * Ação para um arquivo COM entrada no manifesto: deriva cada lado contra o manifesto e consulta
 * a matriz — com uma única exceção, a convergência.
 *
 * `registrar` e não `'nada'` na convergência: sem atualizar o manifesto o hash gravado continua
 * velho, este mesmo `mudou × mudou` se repetiria a cada ciclo e o cofre nunca assentaria.
 */
function acaoComManifesto(
  caminho: string,
  entrada: EntradaArquivo,
  atualLocal: EstadoLocal | undefined,
  atualRemoto: EstadoRemoto | undefined,
): Acao | null {
  const l = ladoLocal(entrada, atualLocal)
  const r = ladoRemoto(entrada, atualRemoto)
  if (l === 'mudou' && r === 'mudou' && convergiram(atualLocal, atualRemoto)) {
    return { tipo: 'registrar', caminho }
  }
  return montarAcao(MATRIZ_CONHECIDO[l][r], caminho, decidirVencedor(caminho, atualLocal, atualRemoto))
}

/**
 * Arquivos SEM entrada no manifesto: primeiro sync, ou criados depois do último ciclo.
 *
 * Aqui — e só aqui — os dois lados se comparam diretamente, porque não existe manifesto contra
 * o qual comparar. Não é a mesma pergunta da matriz de cima: não há "mudou" a detectar, só
 * "são o mesmo arquivo?".
 */
function acaoSemManifesto(
  caminho: string,
  atualLocal: EstadoLocal | undefined,
  atualRemoto: EstadoRemoto | undefined,
): Acao | null {
  const vivoRemoto = atualRemoto !== undefined && !atualRemoto.removido ? atualRemoto : undefined
  if (atualLocal === undefined) {
    // Sem local e sem remoto só acontece com lápide (`removido`) de arquivo que este PC nunca
    // teve. Nada a fazer — nem sequer registrar.
    return vivoRemoto === undefined ? null : { tipo: 'baixar', caminho }
  }
  if (vivoRemoto === undefined) return { tipo: 'subir', caminho }
  // Sem `hash` do Drive não dá para PROVAR que os dois lados são iguais, e supor que são
  // sobrescreveria uma das versões em silêncio. Conflito é a suposição recuperável.
  if (vivoRemoto.hash === undefined) {
    return { tipo: 'conflito', caminho, vencedor: decidirVencedor(caminho, atualLocal, atualRemoto) }
  }
  // CONTRATO, para quem for escrever o cliente do Drive: `EstadoRemoto.hash` tem de vir de
  // `sha256Checksum`, NUNCA de `md5Checksum`. O lado local é SHA-256 (`hash_arquivo`, em Rust), e
  // md5 é o campo que todo mundo conhece — é a escolha errada que a mão vai fazer sozinha. Com
  // algoritmos diferentes esta igualdade nunca dá verdadeira, o `registrar` abaixo nunca dispara,
  // e parear um segundo PC que já tem uma cópia idêntica gera conflito em TODOS os arquivos.
  // (Arquivos nativos do Google Docs não têm checksum nenhum; não é o caso aqui, porque o cofre
  // só guarda JSON e imagem.)
  //
  // Hash igual é o caso que impede um cofre inteiro de subir de novo quando o usuário pareia um
  // segundo PC que já tem uma cópia idêntica: só adota no manifesto, sem subir nem baixar.
  return vivoRemoto.hash === atualLocal.hash
    ? { tipo: 'registrar', caminho }
    : { tipo: 'conflito', caminho, vencedor: decidirVencedor(caminho, atualLocal, atualRemoto) }
}

/** Um caminho do plano junto com a sua forma canônica (NFC, minúsculas), calculada uma vez só. */
interface Endereco {
  caminho: string
  chave: string
}

function endereco(caminho: string): Endereco {
  return { caminho, chave: chaveCaminho(caminho) }
}

function nomeDoArquivo(caminho: string): string {
  return caminho.slice(caminho.lastIndexOf('/') + 1)
}

/** `longo` é `curto` com uma ou mais pastas a mais na frente, comparando na forma canônica. */
function temPastaAMais(longo: Endereco, curto: Endereco): boolean {
  return longo.chave.endsWith(`/${curto.chave}`)
}

/**
 * Na forma canônica, como as outras regras: o NTFS não distingue caixa, e num cofre que já tinha
 * uma pasta `Imagens/` o organizador escreve `imagens/...` e a varredura devolve `Imagens/...`.
 */
function dentroDeImagens(e: Endereco): boolean {
  return e.chave.startsWith(`${PASTA_IMAGENS}/`)
}

/** Imagem sob `imagens/`: o único lugar onde o "Organizar imagens" escreve. */
function ehDoOrganizador(e: Endereco): boolean {
  return dentroDeImagens(e) && ehImagem(e.caminho)
}

/**
 * O caminho `criado` tem cara de ser o `apagado` renomeado? É a segunda prova do par — a primeira,
 * o hash, é necessária mas não basta: o cofre inteiro trocando de endereço sem ninguém pedir também
 * reaparece com o mesmo conteúdo noutro caminho. A ordem das regras importa:
 *
 * 1. Mesma chave canônica (mudou só a caixa, ou NFC virou NFD): deriva, não renomeação. O Windows
 *    não distingue caixa, cópia vinda de macOS ou de zip chega em NFD, e ninguém renomeia assim.
 * 2. Imagem SAINDO de `imagens/` para fora dela: é o desfazer do organizador, que devolve o nome
 *    antigo (`imagens/personagens/Gandalf/retrato.png` volta a ser `retratos/retrato-<id>-<uuid>.png`).
 *    Só não vale quando o novo é o velho com pastas a mais na frente (`imagens/x.png` virando
 *    `Grimorio/imagens/x.png`): aí a raiz subiu, como na 5. Vem antes da 3 porque desfazer
 *    `mapas/Masmorra/01.png` → `imagens/mapas/Masmorra/01.png` tira exatamente o `imagens/` que o
 *    organizador pôs, e a 3 leria isso como a raiz descendo.
 * 3. O velho é o novo com pastas a mais na frente: a raiz do cofre desceu um nível. Vem antes da 4
 *    porque `x/imagens/a.png` virando `imagens/a.png` é isso, não o organizador.
 * 4. Imagem chegando sob `imagens/`: é o organizador, e ele troca o nome do arquivo
 *    (`retratos/retrato-<id>-<uuid>.png` vira `imagens/personagens/Gandalf/retrato.png`), então
 *    comparar nome não serviria.
 * 5. O novo é o velho com pastas a mais na frente: a raiz subiu um nível. Vem depois da 4 porque o
 *    organizador faz isso de propósito — `mapas/Masmorra/01.png` vira `imagens/mapas/Masmorra/01.png`.
 * 6. Fora isso, renomeação é mover a pasta mantendo o nome do arquivo (mover um cenário, arrastar
 *    uma pasta). Nome diferente fora do organizador não prova nada.
 *
 * Custo aceito: renomear só a caixa de uma pasta, ou pôr ou tirar uma pasta em volta de mais da
 * metade do cofre, engata o freio. Errar para esse lado custa uma pergunta; para o outro, o cofre.
 * As regras 2 e 4 aceitam o custo contrário, e só para imagem: a raiz descendo para dentro de
 * `imagens/` (ou subindo de uma pasta chamada `imagens`) pareia as imagens — as fichas, que não são
 * imagem, continuam contando.
 */
function podeSerRenomeacao(apagado: Endereco, criado: Endereco): boolean {
  if (apagado.chave === criado.chave) return false
  if (ehDoOrganizador(apagado) && !dentroDeImagens(criado)) return !temPastaAMais(criado, apagado)
  if (temPastaAMais(apagado, criado)) return false
  if (ehDoOrganizador(criado)) return true
  if (temPastaAMais(criado, apagado)) return false
  return nomeDoArquivo(apagado.caminho) === nomeDoArquivo(criado.caminho)
}

/**
 * O caminho conhecido ainda tem, dos DOIS lados, o conteúdo com que sincronizou? Exige o hash do
 * Drive: sem ele a versão igual diz que nada mudou lá, mas não prova que o conteúdo é o do apagado.
 */
function estaAssentado(
  entrada: EntradaArquivo,
  atualLocal: EstadoLocal | undefined,
  atualRemoto: EstadoRemoto | undefined,
): boolean {
  if (atualLocal === undefined || atualRemoto === undefined || atualRemoto.removido) return false
  return atualLocal.hash === entrada.hash && atualRemoto.hash === entrada.hash
}

/** Tira de `livres` o primeiro endereço que pode ser `apagado` renomeado — 1:1, ele não serve a outra deleção. */
function tirarPar(livres: Endereco[] | undefined, apagado: Endereco): boolean {
  if (livres === undefined) return false
  const par = livres.findIndex((criado) => podeSerRenomeacao(apagado, criado))
  if (par < 0) return false
  livres.splice(par, 1)
  return true
}

/**
 * Deleções que o freio conta: as que NÃO são metade de uma renomeação.
 *
 * Renomear (ou mover) um arquivo chega aqui como uma deleção no caminho velho e uma criação no
 * novo — o motor compara por caminho e não sabe que é o mesmo conteúdo. Organizar as imagens do
 * cofre faz isso em centenas de arquivos de uma vez, e sem este desconto o freio travaria o sync
 * desse cofre para sempre. O plano de ações NÃO muda (o Drive continua recebendo apagar + subir);
 * só a contagem do freio deixa de ver sumiço onde houve mudança de endereço.
 *
 * Pareamento 1:1, só na mesma direção e com duas provas: `apagarRemoto` (sumiu daqui) casa com
 * `subir`; `apagarLocal` (sumiu no outro PC) casa com `baixar`. A primeira prova é o conteúdo: o
 * hash da criação é o do manifesto para o caminho apagado. A segunda é o caminho: ver
 * `podeSerRenomeacao`. Cada criação desconta uma deleção só — duas cópias apagadas com uma criação
 * continuam uma deleção. Hash ausente de qualquer lado não prova nada e conta como deleção: a
 * falha sistemática que o freio existe para pegar não pode se esconder atrás de um pareamento
 * por suposição. O casamento é guloso, na ordem do plano: pode parear menos do que o máximo
 * possível, nunca mais — o freio erra para o lado de perguntar.
 *
 * O lado remoto exige uma prova a mais: o arquivo que chega tem de ter sido gravado no Drive
 * DEPOIS do último sync (com a folga de relógio entre máquinas). Sem isso, uma listagem atrasada
 * logo depois de organizar — o velho X ainda vivo lá, o novo Y ainda invisível — vira "apagar Y
 * aqui + baixar X de volta" com o mesmo hash, e o par apagaria as imagens recém-organizadas sem o
 * freio perguntar. Renomeação de verdade feita no outro PC é sempre posterior ao nosso último sync;
 * o X da listagem atrasada é um arquivo antigo. Data ausente ou ilegível conta como deleção.
 *
 * A renomeação também atravessa ciclos: o endereço novo sincronizou num ciclo anterior e só agora o
 * velho some. O outro PC organizou num upload longo e este baixou os novos antes de ver os velhos
 * sumirem; ou o executor adiou o apagar da imagem velha porque a ficha que a citava não subiu. Aí o
 * par é um caminho CONHECIDO que ainda tem, dos dois lados, o conteúdo do apagado (`estaAssentado`) e
 * passa em `podeSerRenomeacao` — 1:1 também. A listagem atrasada não passa por aqui: o Y que ela
 * esconde não está vivo no Drive, e o X que ela mostra não está no manifesto. Custo aceito: num cofre
 * com cópias idênticas (o mesmo retrato em dois personagens), a falha que leva só uma das cópias
 * desconta essa deleção. O conteúdo continua no cofre, na outra, e o freio perde no máximo uma
 * deleção por cópia que sobrou.
 */
function delecoesSemPar(
  acoes: Acao[],
  conhecidos: Map<string, EntradaArquivo>,
  local: Map<string, EstadoLocal>,
  remoto: Map<string, EstadoRemoto>,
  ultimoSync: string,
): number {
  /** hash → criações daquele conteúdo que ainda podem parear, por direção. */
  const criadasAqui = new Map<string, Endereco[]>()
  const criadasLa = new Map<string, Endereco[]>()
  const guardar = (mapa: Map<string, Endereco[]>, hash: string | undefined, caminho: string) => {
    if (hash === undefined) return
    const lista = mapa.get(hash)
    if (lista === undefined) mapa.set(hash, [endereco(caminho)])
    else lista.push(endereco(caminho))
  }
  // NaN (manifesto sem data válida) faz toda comparação dar falso: nenhuma criação remota pareia.
  const limiteRemoto = Date.parse(ultimoSync) + LIMIAR_CLOCK_SKEW_MS
  const posteriorAoSync = (r: EstadoRemoto) => r.modificadoEm !== undefined && r.modificadoEm > limiteRemoto
  for (const a of acoes) {
    if (a.tipo === 'subir') guardar(criadasAqui, local.get(a.caminho)?.hash, a.caminho)
    if (a.tipo === 'baixar') {
      const r = remoto.get(a.caminho)
      if (r !== undefined && posteriorAoSync(r)) guardar(criadasLa, r.hash, a.caminho)
    }
  }
  /** hash → caminhos conhecidos que seguem com aquele conteúdo dos dois lados, por ordem de caminho. */
  const assentados = new Map<string, Endereco[]>()
  // ordenado como o plano, para o par escolhido não depender da ordem das chaves do manifesto
  for (const caminho of [...conhecidos.keys()].sort()) {
    const entrada = conhecidos.get(caminho)
    if (entrada !== undefined && estaAssentado(entrada, local.get(caminho), remoto.get(caminho))) {
      guardar(assentados, entrada.hash, caminho)
    }
  }

  let semPar = 0
  for (const a of acoes) {
    if (a.tipo !== 'apagarLocal' && a.tipo !== 'apagarRemoto') continue
    const hash = conhecidos.get(a.caminho)?.hash
    if (hash === undefined) {
      semPar += 1
      continue
    }
    const apagado = endereco(a.caminho)
    // primeiro a criação deste ciclo, no mesmo sentido; senão, o endereço que já sincronizou antes
    const doCiclo = (a.tipo === 'apagarRemoto' ? criadasAqui : criadasLa).get(hash)
    if (!tirarPar(doCiclo, apagado) && !tirarPar(assentados.get(hash), apagado)) semPar += 1
  }
  return semPar
}

/**
 * Decide o que sobe, o que desce, o que some e o que é conflito.
 *
 * Devolve um plano ou uma recusa. A recusa é valor de retorno e não exceção porque o freio de
 * deleção em massa é decisão de produto (perguntar ao usuário), não erro de programa.
 *
 * **Pré-condição das chaves.** Os três conjuntos — manifesto, varredura local e listagem remota —
 * têm de chegar na MESMA forma canônica de caminho: separador `/`, mesma caixa e mesma normalização
 * Unicode. Garantir isso é de quem monta os mapas; aqui é comparação de string, e string não sabe
 * que dois caminhos são o mesmo arquivo.
 *
 * Os dois jeitos de errar são concretos. O Windows trata caminho como caso-insensível e o Drive
 * como caso-sensível, então o mesmo arquivo pode chegar `Gandalf.json` de um lado e `gandalf.json`
 * do outro. E caminho em pt-BR aparece ora em NFC ora em NFD — `ç` como um code point, ou como `c`
 * seguido de cedilha combinante.
 *
 * Em qualquer um dos dois, um arquivo vira DUAS chaves na união. A chave que o manifesto conhece
 * não tem lado local e gera `apagarRemoto`; a outra não tem manifesto e gera `subir`. Nada se
 * perde, mas o cofre troca de arquivo consigo mesmo a cada ciclo, para sempre.
 */
export function reconciliar(
  manifesto: Manifesto,
  local: Map<string, EstadoLocal>,
  remoto: Map<string, EstadoRemoto>,
): Plano {
  // Map em vez de índice no objeto para que um arquivo chamado `constructor` ou `toString`
  // não caia no protótipo e vire uma entrada de manifesto fantasma.
  const conhecidos = new Map(Object.entries(manifesto.arquivos))

  // União ordenada por caminho: a ordem do plano não depende da ordem de inserção dos Maps,
  // então a mesma entrada produz sempre exatamente o mesmo plano. Um executor que se comporta
  // diferente a cada rodada é intestável.
  const caminhos = [...new Set([...conhecidos.keys(), ...local.keys(), ...remoto.keys()])].sort()

  const acoes: Acao[] = []
  for (const caminho of caminhos) {
    const entrada = conhecidos.get(caminho)
    const atualLocal = local.get(caminho)
    const atualRemoto = remoto.get(caminho)
    const acao = entrada === undefined
      ? acaoSemManifesto(caminho, atualLocal, atualRemoto)
      : acaoComManifesto(caminho, entrada, atualLocal, atualRemoto)
    if (acao !== null) acoes.push(acao)
  }

  // Freio de deleção em massa. É o default do rclone e do remotely-save, e existe porque é
  // exatamente assim que um sync perde um cofre inteiro: uma pasta que não montou, um caminho
  // que mudou, e o motor conclui que tudo foi apagado. Conta só a deleção SEM par: a metade de
  // uma renomeação (mesmo conteúdo reaparecendo noutro caminho, no mesmo sentido — e, vindo do
  // Drive, gravado depois do último sync —, ou já sincronizado noutro caminho num ciclo anterior)
  // não é sumiço. Mas conteúdo igual não basta: o caminho novo também tem de ter cara de
  // renomeação (o organizador de imagens e o desfazer dele, ou uma pasta movida com os arquivos
  // mantendo o nome). Deriva de caixa, de NFC/NFD ou de pasta da raiz a mais ou a
  // menos continua contando como deleção — é o cofre inteiro mudando de endereço sem ninguém ter
  // pedido. Ver `delecoesSemPar` e `podeSerRenomeacao` para as provas que o par exige, e para o
  // caso da listagem atrasada, que sem elas passaria pelo freio.
  const total = conhecidos.size
  const apagaria = delecoesSemPar(acoes, conhecidos, local, remoto, manifesto.ultimoSync)
  // O piso também cobre o manifesto vazio (primeiro sync): sem base, nada a medir e nada a dividir.
  if (total >= MINIMO_PARA_FREIO && apagaria > total * LIMITE_DELECAO) {
    return { ok: false, motivo: 'delecao-em-massa', apagaria, total }
  }
  return { ok: true, acoes }
}

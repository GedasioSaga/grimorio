import { quemCita } from './citacoes'
import { calcularHashEntrada, sha256Texto } from './impressao'
import { chaveCaminho } from './nomes'
import { paraCadaString, reescreverTexto, relsEmHtml } from './referencias'
import type { OpcoesExecucao, Plano, PortasOrganizar, ResultadoExecucao } from './tipos'
import { chaveDoCofre } from './ultima'

/**
 * Executor do "Organizar imagens": aplica um `Plano` e sabe desfazê-lo.
 *
 * A ordem é o que protege o cofre:
 *
 * 1. **Diário antes de tudo.** Cada arquivo que o plano vai mover, remover ou reescrever é copiado
 *    para `dirDiario` — FORA do cofre, então não sobe para o Drive e não aparece em lugar nenhum
 *    do app — e a cópia é conferida por hash. Sem diário conferido, nada no cofre é tocado. E o
 *    diário em disco é regravado ANTES de cada fase com tudo que ela pode mudar (o que vai ser
 *    criado; o texto que vai ser reescrito, com o hash que vai ter): se o app cair no meio, o
 *    diário que ficou basta para desfazer.
 * 2. **Copiar → reescrever → remover.** O endereço novo existe antes de qualquer ficha apontar
 *    para ele, e o velho só some depois de todas apontarem para o novo. O planejador garante que
 *    nenhum destino existe hoje, então copiar nunca sobrescreve.
 * 3. **Falhou no meio, volta sozinho.** Um erro em qualquer passo desfaz o que já foi feito, a partir
 *    do diário, antes de a exceção sair daqui. A volta devolve primeiro as imagens, depois os textos
 *    — que citam os endereços ANTIGOS, então cada um só volta com as imagens que ele cita de volta —
 *    e só então apaga o que o plano criou, e só o que ninguém cita. Se um original não voltar, nada
 *    é apagado (quem não voltou ainda aponta para o endereço novo) e o diário fica em `desfazendo`:
 *    o botão de desfazer tenta de novo, sem conferir nem regravar o que já voltou.
 *
 * `desfazerOrganizacao` é o mesmo retorno, sob pedido — e recusa se alguma ficha mudou depois da
 * organização, porque voltar a cópia do diário apagaria essa edição sem aviso. Só desfaz no cofre
 * em que a organização foi feita: duas cópias do mesmo cofre não desfazem uma à outra.
 *
 * `abandonarOrganizacao` é a saída de quem ficou com uma organização (ou volta) pela metade e não
 * consegue, ou não quer, terminar a volta: o cofre fica como está, e organizar volta a valer.
 *
 * Nos dois sentidos vale a regra de `citacoes.ts`: imagem que alguém ainda cita não se apaga nem se
 * sobrescreve. Organizar deixa no lugar o original que uma ficha fora da prévia cita; desfazer
 * mantém a imagem organizada que alguém passou a citar e recusa gravar por cima de arquivo novo.
 */

export type CodigoErroOrganizar =
  | 'cofre-mudou'
  | 'destino-ocupado'
  | 'diario'
  | 'falhou'
  | 'volta-incompleta'
  | 'nada-a-desfazer'
  | 'mudou-depois'
  | 'outro-cofre'
  /** Recusa da costura: a última organização do cofre (ou a volta dela) ficou pela metade. */
  | 'pendente'
  /** Manter o cofre como está só vale para organização (ou volta) pela metade, e esta não está. */
  | 'nada-pendente'

export class ErroOrganizar extends Error {
  constructor(
    readonly codigo: CodigoErroOrganizar,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroOrganizar'
  }
}

/** Cópia conferida de um original, guardada no diário. */
interface CopiaDiario {
  rel: string
  copia: string
  sha256: string
  /**
   * Texto do plano (ficha, mapa, nota). Texto que nunca chegou a ser reescrito (o app caiu antes)
   * não volta: está como era. Diário sem o campo: conta como texto quem está em `reescritos`.
   */
  texto?: boolean
  /**
   * Só em texto: os endereços antigos que ele volta a citar (os `de` do plano). Ele só volta quando
   * todos esses voltaram — senão voltaria com imagem quebrada. Diário sem o campo: espera todas.
   */
  cita?: string[]
  /**
   * Já está como o original — voltou numa volta que parou depois, ou nem tinha saído. Tentar de novo
   * não confere nem devolve outra vez: o que mudou depois disso é edição do usuário, não da volta.
   */
  voltou?: boolean
}

/** O que o diário guarda — o suficiente para desfazer sem o plano e sem o cofre original. */
interface Diario {
  versao: 1
  planoId: string
  raiz: string
  /**
   * `aplicando`: a organização começou e não terminou — está rodando, ou o app caiu no meio. O
   * diário já descreve tudo que a fase em curso pode ter mudado, então desfazer é seguro.
   * `desfazendo`: uma volta (a automática, depois de uma falha, ou a pedida) começou e não terminou
   * — algum original não voltou, ou algo criado não saiu. Desfazer de novo é seguro e continua dela.
   * `abandonado`: estava pela metade e o usuário mandou manter o cofre como está. Não se desfaz mais.
   */
  estado: 'aplicando' | 'concluido' | 'desfazendo' | 'revertido' | 'desfeito' | 'abandonado'
  copias: CopiaDiario[]
  /**
   * Arquivo que o plano CRIA no cofre (destino de movimento), com o conteúdo esperado. Todos entram
   * ANTES da primeira cópia, para o pedaço que uma cópia interrompida (ou uma queda) deixe no
   * destino também sair na volta; `conferido` vira `true` só quando o hash do destino bate.
   */
  criados: { rel: string; sha256: string; conferido: boolean }[]
  /**
   * Texto reescrito, com o hash DEPOIS da reescrita — o desfazer confere que ninguém mexeu. Todos
   * entram, com o hash que o texto novo vai ter, antes de a primeira ficha ser gravada.
   */
  reescritos: { rel: string; sha256: string }[]
}

const ARQUIVO_DIARIO = 'diario.json'

/** Pela metade: organização que não terminou (o app caiu no meio) ou volta que parou no meio. */
const PELA_METADE = new Set<Diario['estado']>(['aplicando', 'desfazendo'])

/** Estados em que o botão de desfazer vale: concluída, ou pela metade. */
const DESFAZIVEIS = new Set<Diario['estado']>(['concluido', ...PELA_METADE])

/**
 * Quantas vezes o fim da organização é gravado antes de virar problema. Sem o `concluido` no disco,
 * fica o `aplicando` da última fase, e a organização que deu certo passa a parecer pela metade — o
 * Organizar trava até alguém desfazê-la ou manter o cofre como está. A gravação do Rust já insiste
 * no rename (`lib.rs`); esta cobre o resto (o temporário que não gravou, a ponte que falhou).
 */
const TENTATIVAS_DE_REGISTRAR_O_FIM = 2

/**
 * Onde a volta copia cada original antes do rename: AO LADO do destino, porque rename só é atômico
 * (e só funciona) no mesmo volume, e o diário pode estar em outro disco.
 */
const SUFIXO_TEMPORARIO = '.tmp-desfazer'

/**
 * Seções que o app cria e espera encontrar. Limpar pasta vazia pode subir até a raiz, mas nunca
 * apaga uma destas — o `VaultRepo` não recria todas no meio da sessão.
 */
const PASTAS_DO_APP = new Set(['campanhas', 'canvases-soltos', 'mapas-soltos', 'personagens-soltos', 'cenarios', 'itens', '.lixeira'])

function dirDe(rel: string): string {
  const corte = rel.lastIndexOf('/')
  return corte < 0 ? '' : rel.slice(0, corte)
}

async function gravarDiario(portas: PortasOrganizar, dirDiario: string, diario: Diario): Promise<void> {
  await portas.fs.writeTextAtomic(`${dirDiario}/${ARQUIVO_DIARIO}`, JSON.stringify(diario, null, 2))
}

/** Grava o diário insistindo até `tentativas` vezes. `null` se gravou; senão, a última falha em texto. */
async function gravarDiarioInsistindo(
  portas: PortasOrganizar,
  dirDiario: string,
  diario: Diario,
  tentativas: number,
): Promise<string | null> {
  let falha = ''
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    try {
      await gravarDiario(portas, dirDiario, diario)
      return null
    } catch (e) {
      falha = String(e)
    }
  }
  return falha
}

/** Apaga pastas que ficaram vazias, subindo a partir de cada uma, sem tocar raiz nem seção do app. */
async function limparPastasVazias(raiz: string, rels: string[], portas: PortasOrganizar): Promise<void> {
  const dirs = [...new Set(rels.map(dirDe))].sort((a, b) => b.length - a.length)
  for (const inicial of dirs) {
    let dir = inicial
    while (dir !== '' && !PASTAS_DO_APP.has(dir.toLowerCase())) {
      try {
        if ((await portas.fs.listDir(`${raiz}/${dir}`)).length > 0) break
        await portas.fs.removePath(`${raiz}/${dir}`)
      } catch {
        break // pasta já não existe ou o disco não deixou listar: não é nosso para apagar
      }
      dir = dirDe(dir)
    }
  }
}

/**
 * Devolve um original ao cofre. O que já voltou não é tocado de novo, e o que já tem o conteúdo do
 * original não é regravado. O resto vai por um temporário ao lado + rename, nunca por cima: o
 * `copy_file` do Tauri (`std::fs::copy`) trunca o destino ao abrir, e uma cópia interrompida por
 * cima deixaria a ficha pela metade — e o desfazer travado em "mudou depois" para sempre.
 */
async function devolverOriginal(c: CopiaDiario, raiz: string, portas: PortasOrganizar): Promise<void> {
  if (c.voltou === true) return
  const destino = `${raiz}/${c.rel}`
  if (!((await portas.fs.exists(destino)) && (await portas.hash(destino)) === c.sha256)) {
    const temporario = `${destino}${SUFIXO_TEMPORARIO}`
    try {
      await portas.fs.copyFile(c.copia, temporario)
      if ((await portas.hash(temporario)) !== c.sha256) throw new Error('a cópia guardada no diário não bate com o original')
      await portas.fs.rename(temporario, destino)
    } catch (e) {
      await portas.fs.removePath(temporario).catch(() => undefined) // o pedaço não pode ficar no cofre
      throw e
    }
  }
  c.voltou = true
}

interface Volta {
  /** O que não voltou ou não saiu. Vazio = o cofre está como o diário descreve. */
  falhas: string[]
  /** Imagem criada que ficou no cofre porque alguém ainda a cita (a regra de `citacoes.ts`). */
  ficaram: string[]
}

/**
 * Volta o cofre ao que o diário descreve. Idempotente: roda igual depois de uma execução completa,
 * de uma que parou no meio (ou caiu) e de uma volta anterior que não terminou.
 *
 * A ordem é a proteção. Primeiro as imagens, depois os textos — e o texto que cita uma imagem que
 * não voltou espera: devolvido, ele citaria o endereço antigo dela, onde não há nada. Esperando, ele
 * continua apontando para o endereço novo, que segue no cofre. Os outros voltam já: quanto menos
 * ficha fica no meio do caminho, menos edição do usuário cai em cima de uma volta pendente. Só com
 * tudo de volta o que o plano criou sai, e mesmo assim só o que ninguém cita.
 */
async function voltarDoDiario(diario: Diario, portas: PortasOrganizar): Promise<Volta> {
  const { raiz } = diario
  const reescritos = new Set(diario.reescritos.map((r) => chaveCaminho(r.rel)))
  const foiReescrito = (c: CopiaDiario) => reescritos.has(chaveCaminho(c.rel))
  // Texto do plano que não está em `reescritos` nunca foi gravado (o app caiu antes): fica como está.
  const imagens = diario.copias.filter((c) => c.texto !== true && !foiReescrito(c))
  const textos = diario.copias.filter(foiReescrito)
  const falhas: string[] = []
  const devolver = async (c: CopiaDiario) => {
    try {
      await devolverOriginal(c, raiz, portas)
    } catch (e) {
      falhas.push(`Não deu para devolver ${c.rel}: ${String(e)}`)
    }
  }
  for (const c of imagens) await devolver(c)
  const faltam = new Set(imagens.filter((c) => c.voltou !== true).map((c) => chaveCaminho(c.rel)))
  const esperando: string[] = []
  for (const c of textos) {
    const citaQueFalta = c.cita === undefined
      ? faltam.size > 0 // diário sem `cita`: não dá para saber qual imagem ele cita
      : c.cita.some((rel) => faltam.has(chaveCaminho(rel)))
    if (c.voltou !== true && citaQueFalta) esperando.push(c.rel)
    else await devolver(c)
  }
  if (esperando.length > 0) {
    falhas.push(
      `${esperando.join(', ')} ${esperando.length === 1 ? 'continua' : 'continuam'} apontando para os endereços novos, `
        + 'que seguem no cofre, até as imagens acima voltarem.',
    )
  }
  if (falhas.length > 0) return { falhas, ficaram: [] }

  const originais = new Set(diario.copias.map((c) => chaveCaminho(c.rel)))
  // O criado que também é um original (só a caixa mudando) já voltou com a cópia acima.
  const apagar = diario.criados.map((c) => c.rel).filter((rel) => !originais.has(chaveCaminho(rel)))
  let citados: Map<string, string[]>
  try {
    citados = await quemCita(raiz, portas.fs, apagar)
  } catch (e) {
    return { falhas: [`Não deu para conferir quem ainda cita as imagens novas, então nenhuma foi apagada: ${String(e)}`], ficaram: [] }
  }
  const ficaram: string[] = []
  for (const rel of apagar) {
    const citam = citados.get(rel) ?? []
    if (citam.length > 0) {
      ficaram.push(`${rel} ficou no cofre porque ${citam.join(', ')} ainda a cita.`)
      continue
    }
    try {
      if (await portas.fs.exists(`${raiz}/${rel}`)) await portas.fs.removePath(`${raiz}/${rel}`)
    } catch (e) {
      falhas.push(`Não deu para apagar ${rel}: ${String(e)}`)
    }
  }
  await limparPastasVazias(raiz, apagar, portas)
  return { falhas, ficaram }
}

/**
 * Conferência final: cada destino tem o conteúdo esperado e nenhum texto ainda cita endereço velho.
 * Roda com a organização já feita, então não lança: o que não deu para conferir vira problema.
 */
async function verificar(plano: Plano, raiz: string, portas: PortasOrganizar): Promise<string[]> {
  const problemas: string[] = []
  for (const m of plano.movimentos) {
    const abs = `${raiz}/${m.para}`
    try {
      if (!(await portas.fs.exists(abs)) || (await portas.hash(abs)) !== m.sha256) {
        problemas.push(`${m.para} não ficou com o conteúdo de ${m.de}.`)
      }
    } catch (e) {
      problemas.push(`Não deu para conferir ${m.para}: ${String(e)}`)
    }
  }
  for (const t of plano.reescritas) {
    const velhos = new Set(t.pares.map((p) => p.de))
    let texto: string
    try {
      texto = await portas.fs.readText(`${raiz}/${t.arquivo}`)
    } catch (e) {
      problemas.push(`Não deu para reler ${t.arquivo}: ${String(e)}`)
      continue
    }
    const restantes = new Set<string>()
    const olhar = (s: string) => {
      if (velhos.has(s)) restantes.add(s)
      for (const r of relsEmHtml(s)) if (velhos.has(r)) restantes.add(r)
    }
    if (t.arquivo.toLowerCase().endsWith('.json')) {
      try {
        paraCadaString(JSON.parse(texto.replace(/^﻿/, '')), olhar)
      } catch {
        problemas.push(`${t.arquivo} deixou de ser JSON válido.`)
      }
    } else {
      olhar(texto)
    }
    for (const r of restantes) problemas.push(`${t.arquivo} ainda cita ${r}.`)
  }
  return problemas
}

export async function executarPlano(plano: Plano, opcoes: OpcoesExecucao): Promise<ResultadoExecucao> {
  const { raiz, dirDiario, portas, aoProgresso, registrarDesfazer } = opcoes
  const abs = (rel: string) => `${raiz}/${rel}`

  // ---- preparado: o plano ainda descreve o cofre? ----
  if ((await calcularHashEntrada(raiz, plano, portas)) !== plano.hashEntrada) {
    throw new ErroOrganizar('cofre-mudou', 'O cofre mudou desde a prévia. Gere a prévia de novo antes de organizar.')
  }
  const destinos = new Set<string>()
  for (const m of plano.movimentos) {
    const chave = chaveCaminho(m.para)
    if (destinos.has(chave) || (await portas.fs.exists(abs(m.para)))) {
      throw new ErroOrganizar('destino-ocupado', `Já existe um arquivo em ${m.para}. Gere a prévia de novo.`)
    }
    destinos.add(chave)
  }

  // ---- diário: cópia conferida de todo original que vai ser mexido ----
  const originais = [...new Set([
    ...plano.movimentos.map((m) => m.de),
    ...plano.remocoes.map((r) => r.rel),
    ...plano.reescritas.map((t) => t.arquivo),
  ])]
  // De cada texto, o endereço antigo de cada imagem que ele cita: devolvido, é isso que ele volta a citar.
  const citaDe = new Map(plano.reescritas.map((t) => [chaveCaminho(t.arquivo), t.pares.map((p) => p.de)]))
  const diario: Diario = {
    versao: 1, planoId: plano.id, raiz, estado: 'aplicando', copias: [], criados: [], reescritos: [],
  }
  try {
    await portas.fs.mkdirAll(dirDiario)
    await portas.fs.writeTextAtomic(`${dirDiario}/plano.json`, JSON.stringify(plano, null, 2))
    for (const [i, rel] of originais.entries()) {
      const copia = `${dirDiario}/copias/${String(i + 1).padStart(5, '0')}`
      const sha256 = await portas.hash(abs(rel))
      await portas.fs.copyFile(abs(rel), copia)
      if ((await portas.hash(copia)) !== sha256) throw new Error(`a cópia de ${rel} não bateu com o original`)
      const cita = citaDe.get(chaveCaminho(rel))
      diario.copias.push(cita === undefined ? { rel, copia, sha256, texto: false } : { rel, copia, sha256, texto: true, cita })
    }
    // Todo destino entra antes da primeira cópia: se o app cair movendo, a volta sabe o que pode ter
    // ficado no cofre — cópia inteira ou pedaço.
    diario.criados = plano.movimentos.map((m) => ({ rel: m.para, sha256: m.sha256, conferido: false }))
    await gravarDiario(portas, dirDiario, diario)
  } catch (e) {
    throw new ErroOrganizar('diario', `Não deu para guardar o diário de desfazer; nada no cofre foi mexido. (${String(e)})`)
  }
  if (registrarDesfazer !== undefined) {
    try {
      await registrarDesfazer()
    } catch (e) {
      // Nada foi feito: o diário não pode ficar parecendo uma organização pela metade.
      diario.estado = 'revertido'
      await gravarDiario(portas, dirDiario, diario).catch(() => undefined)
      throw new ErroOrganizar(
        'diario',
        `Não deu para anotar esta organização para o botão de desfazer; nada no cofre foi mexido. (${String(e)})`,
      )
    }
  }

  const total = plano.movimentos.length + plano.reescritas.length + plano.movimentos.length + plano.remocoes.length
  let feito = 0
  const avancar = (fase: string) => aoProgresso?.(++feito, total, fase)
  /** Originais que ficaram no lugar porque alguém fora do plano ainda os cita. */
  const ficaram: string[] = []
  let removidos = 0
  try {
    for (const [i, m] of plano.movimentos.entries()) {
      await portas.fs.copyFile(abs(m.de), abs(m.para))
      if ((await portas.hash(abs(m.para))) !== m.sha256) throw new Error(`a cópia para ${m.para} não bateu com ${m.de}`)
      diario.criados[i].conferido = true
      avancar('movendo')
    }
    // O texto novo de cada ficha, e o hash que ele vai ter, entram no diário antes de a primeira ser
    // gravada: se o app cair reescrevendo, o desfazer reconhece a ficha que já foi reescrita.
    const novos: string[] = []
    const reescritos: Diario['reescritos'] = []
    for (const t of plano.reescritas) {
      const novo = reescreverTexto(t.arquivo, await portas.fs.readText(abs(t.arquivo)), t.pares)
      novos.push(novo)
      reescritos.push({ rel: t.arquivo, sha256: await sha256Texto(novo) })
    }
    diario.reescritos = reescritos
    await gravarDiario(portas, dirDiario, diario)
    for (const [i, t] of plano.reescritas.entries()) {
      await portas.fs.writeTextAtomic(abs(t.arquivo), novos[i])
      reescritos[i].sha256 = await portas.hash(abs(t.arquivo)) // o que o disco guardou de fato
      avancar('reescrevendo')
    }
    await gravarDiario(portas, dirDiario, diario)
    const saem = [...plano.movimentos.map((m) => m.de), ...plano.remocoes.map((r) => r.rel)]
    const doPlano = new Set(plano.remocoes.map((r) => chaveCaminho(r.rel)))
    // As fichas do plano já apontam para o endereço novo; quem AINDA cita um original é alguém que
    // o plano não viu (ficha criada depois da prévia, JSON ilegível). Esse original fica.
    const citados = await quemCita(raiz, portas.fs, saem)
    for (const rel of saem) {
      const citam = citados.get(rel) ?? []
      if (citam.length > 0) {
        ficaram.push(`${rel} ficou no endereço antigo: ${citam.join(', ')} ainda o cita e não estava na prévia. Gere a prévia e organize de novo.`)
      } else if (!destinos.has(chaveCaminho(rel))) {
        // Defesa: um original que também é destino (só a caixa mudando) não pode ser apagado — no
        // NTFS seria apagar o arquivo que acabou de chegar. O planejador nunca gera isso.
        await portas.fs.removePath(abs(rel))
        if (doPlano.has(chaveCaminho(rel))) removidos += 1
      }
      avancar('removendo')
    }
    await limparPastasVazias(raiz, saem, portas)
  } catch (e) {
    const volta = await voltarDoDiario(diario, portas)
    if (volta.falhas.length === 0) {
      diario.estado = 'revertido'
      await gravarDiario(portas, dirDiario, diario).catch(() => undefined) // o cofre já voltou; o registro é secundário
      const extra = volta.ficaram.length > 0 ? ` Atenção: ${volta.ficaram.join(' ')}` : ''
      throw new ErroOrganizar('falhou', `A organização falhou e o cofre foi devolvido como estava: ${String(e)}.${extra}`)
    }
    // A volta parou no meio: o diário continua valendo, e o desfazer retoma dele.
    diario.estado = 'desfazendo'
    // Se nem isso gravar, fica o diário da última fase — que basta para desfazer, só sem saber o
    // que esta volta já devolveu (tentar de novo reconhece pelo hash o que voltou e não mudou).
    const registrou = await gravarDiario(portas, dirDiario, diario).then(() => true, () => false)
    const comoSeguir = registrou
      ? `Use "Desfazer última organização" para tentar de novo; o diário ficou em ${dirDiario}.`
      : `Não deu para registrar no diário onde a volta parou, mas "Desfazer última organização" continua seguro; as cópias dos originais estão em ${dirDiario}/copias.`
    throw new ErroOrganizar(
      'volta-incompleta',
      `A organização falhou (${String(e)}) e a volta não terminou: ${[...volta.falhas, ...volta.ficaram].join(' ')} `
        + `Nenhuma imagem que uma ficha ainda cita foi apagada. ${comoSeguir}`,
    )
  }

  // ---- o cofre já está organizado: daqui em diante, o que der errado vira problema, não falha ----
  aoProgresso?.(total, total, 'verificando')
  const problemas = [...ficaram, ...(await verificar(plano, raiz, portas))]
  diario.estado = 'concluido'
  const falhaAoRegistrar = await gravarDiarioInsistindo(portas, dirDiario, diario, TENTATIVAS_DE_REGISTRAR_O_FIM)
  if (falhaAoRegistrar !== null) {
    problemas.push(
      `As imagens foram organizadas, mas o diário de desfazer não registrou o fim (${falhaAoRegistrar}), `
        + 'então o app passa a tratar esta organização como pela metade. Desfazer continua funcionando; '
        + 'para ficar com ela e organizar de novo depois, use "Manter o cofre como está".',
    )
  }
  aoProgresso?.(total, total, 'concluido')
  return {
    fase: 'concluido',
    movidos: plano.movimentos.length,
    reescritos: plano.reescritas.length,
    removidos,
    problemas,
  }
}

export interface ResultadoDesfazer {
  planoId: string
  /** O que não deu para devolver. Vazio = cofre igual ao de antes da organização. */
  problemas: string[]
  /**
   * `false`: a volta parou no meio (um original não voltou, algo criado não saiu). O diário fica em
   * `desfazendo` e desfazer de novo é seguro. `true` com `problemas`: só ficaram imagens que alguém
   * ainda cita — e isso tentar de novo não muda.
   */
  completo: boolean
}

/** Lê o diário de uma organização; `null` se não existe ou está ilegível. */
export async function lerDiario(dirDiario: string, portas: PortasOrganizar): Promise<Diario | null> {
  try {
    const bruto: unknown = JSON.parse(await portas.fs.readText(`${dirDiario}/${ARQUIVO_DIARIO}`))
    return ehDiario(bruto) ? bruto : null
  } catch {
    return null
  }
}

function ehDiario(v: unknown): v is Diario {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Partial<Diario> // as: só para ler os campos; cada um é conferido logo abaixo
  return d.versao === 1 && typeof d.planoId === 'string' && typeof d.raiz === 'string'
    && typeof d.estado === 'string' && Array.isArray(d.copias) && Array.isArray(d.criados) && Array.isArray(d.reescritos)
}

/**
 * O que o botão de desfazer encontra num diário, visto do cofre aberto:
 * - `nada`: não existe, está ilegível, já foi desfeita, revertida ou mantida como estava, ou é de
 *   outro cofre;
 * - `desfazivel`: organização concluída;
 * - `pendente`: organização ou volta que parou no meio. Desfazer termina a volta; organizar de novo
 *   por cima faria o botão esquecê-la sem ninguém decidir, então a costura recusa — e a saída de quem
 *   não quer (ou não consegue) terminar a volta é `abandonarOrganizacao`.
 *
 * O cofre é comparado sem caixa nem barra, como o Windows compara caminhos.
 */
export type SituacaoDoDesfazer = 'nada' | 'desfazivel' | 'pendente'

export async function situacaoDoDiario(
  dirDiario: string,
  portas: PortasOrganizar,
  raizAberta: string,
): Promise<SituacaoDoDesfazer> {
  const diario = await lerDiario(dirDiario, portas)
  if (diario === null || !DESFAZIVEIS.has(diario.estado) || chaveDoCofre(diario.raiz) !== chaveDoCofre(raizAberta)) {
    return 'nada'
  }
  return PELA_METADE.has(diario.estado) ? 'pendente' : 'desfazivel'
}

/**
 * "Manter o cofre como está": tira do caminho uma organização (ou volta) que parou no meio, sem mexer
 * no cofre. O diário passa a `abandonado`, o botão de desfazer deixa de oferecê-la e organizar de novo
 * volta a valer.
 *
 * É a saída de quem não consegue terminar a volta — uma ficha editada depois faz o desfazer recusar
 * com `mudou-depois` para sempre, e uma cópia do diário que estragou nunca volta — ou não quer: a
 * organização que deu certo mas não registrou o fim parece pela metade, e desfazê-la jogaria fora o
 * que deu certo. Sem esta saída o Organizar ficaria travado para sempre.
 *
 * Ficar com o cofre como está é seguro porque, pela metade, ele já está inteiro: organizar copia antes
 * de reescrever e só tira um original quando ninguém mais o cita, e a volta só devolve um texto junto
 * com as imagens que ele cita e só apaga o criado que ninguém cita. Toda ficha cita um arquivo que
 * existe; o que pode sobrar é cópia que ninguém cita, nunca imagem quebrada.
 */
export async function abandonarOrganizacao(
  dirDiario: string,
  portas: PortasOrganizar,
  raizAberta: string,
): Promise<void> {
  const diario = await lerDiario(dirDiario, portas)
  if (diario === null || !PELA_METADE.has(diario.estado)) {
    throw new ErroOrganizar('nada-pendente', 'Não há organização pela metade neste cofre.')
  }
  if (chaveDoCofre(diario.raiz) !== chaveDoCofre(raizAberta)) {
    throw new ErroOrganizar(
      'outro-cofre',
      `Esta organização foi feita em ${diario.raiz}, não no cofre aberto (${raizAberta}). Abra aquele cofre para mantê-lo como está.`,
    )
  }
  diario.estado = 'abandonado'
  try {
    await gravarDiario(portas, dirDiario, diario)
  } catch (e) {
    throw new ErroOrganizar(
      'diario',
      `Não deu para registrar no diário que o cofre fica como está; nada mudou, e a organização continua pela metade. (${String(e)})`,
    )
  }
}

export async function desfazerOrganizacao(
  dirDiario: string,
  portas: PortasOrganizar,
  raizAberta: string,
): Promise<ResultadoDesfazer> {
  const diario = await lerDiario(dirDiario, portas)
  if (diario === null || !DESFAZIVEIS.has(diario.estado)) {
    throw new ErroOrganizar('nada-a-desfazer', 'Não há organização concluída para desfazer.')
  }
  const { raiz } = diario
  if (chaveDoCofre(raiz) !== chaveDoCofre(raizAberta)) {
    throw new ErroOrganizar(
      'outro-cofre',
      `Esta organização foi feita em ${raiz}, não no cofre aberto (${raizAberta}). Abra aquele cofre para desfazê-la.`,
    )
  }
  // Pela metade (organização que caiu, ou volta que parou): parte pode nem ter saído do lugar.
  const pelaMetade = diario.estado !== 'concluido'
  const copiaDe = new Map(diario.copias.map((c) => [chaveCaminho(c.rel), c]))
  // Quem mudou depois da organização perderia a edição se a cópia do diário voltasse por cima.
  const mudaram: string[] = []
  for (const r of diario.reescritos) {
    const copia = copiaDe.get(chaveCaminho(r.rel))
    // Já voltou numa tentativa anterior: o que mudou depois é edição do usuário, e a volta não a toca.
    if (copia?.voltou === true) continue
    const atual = await portas.hash(`${raiz}/${r.rel}`).catch(() => null)
    // Como a organização deixou, ou igual ao original (o app caiu antes de reescrevê-la, ou uma volta
    // que não chegou a se registrar já a devolveu): devolver não apaga edição de ninguém.
    if (atual !== null && (atual === r.sha256 || atual === copia?.sha256)) continue
    mudaram.push(r.rel)
  }
  for (const c of diario.criados) {
    // Pela metade, o criado que nunca ficou inteiro (cópia interrompida) ou que já saiu não tem o
    // que conferir: a volta só o apaga se ainda estiver lá.
    if (pelaMetade && (!c.conferido || !(await portas.fs.exists(`${raiz}/${c.rel}`)))) continue
    const atual = await portas.hash(`${raiz}/${c.rel}`).catch(() => null)
    if (atual !== c.sha256) mudaram.push(c.rel)
  }
  if (mudaram.length > 0) {
    throw new ErroOrganizar(
      'mudou-depois',
      `Estes arquivos mudaram depois da organização, e desfazer apagaria a mudança: ${mudaram.join(', ')}.`,
    )
  }
  // O endereço antigo de uma imagem ficou livre depois de organizar; se alguém gravou OUTRO arquivo
  // ali, devolver a cópia do diário o apagaria. Texto já foi conferido acima (ou nunca foi
  // reescrito e não volta), e o que já voltou não é regravado.
  const reescritos = new Set(diario.reescritos.map((r) => chaveCaminho(r.rel)))
  const ocupados: string[] = []
  for (const c of diario.copias) {
    if (c.voltou === true || c.texto === true || reescritos.has(chaveCaminho(c.rel))) continue
    const abs = `${raiz}/${c.rel}`
    if (!(await portas.fs.exists(abs))) continue
    if ((await portas.hash(abs).catch(() => null)) !== c.sha256) ocupados.push(c.rel)
  }
  if (ocupados.length > 0) {
    throw new ErroOrganizar(
      'mudou-depois',
      `Estes endereços antigos agora têm outro arquivo, e desfazer gravaria por cima dele: ${ocupados.join(', ')}.`,
    )
  }
  // Registrado ANTES de mexer: se a volta parar no meio, o diário já diz que ela é para retomar.
  diario.estado = 'desfazendo'
  try {
    await gravarDiario(portas, dirDiario, diario)
  } catch (e) {
    throw new ErroOrganizar('diario', `Não deu para registrar o início do desfazer; nada no cofre foi mexido. (${String(e)})`)
  }
  // Imagem organizada que alguém passou a citar depois fica no cofre: a volta confere quem cita
  // DEPOIS de devolver as fichas, então só conta quem cita de verdade o endereço novo.
  const { falhas, ficaram } = await voltarDoDiario(diario, portas)
  const completo = falhas.length === 0
  const problemas = [...falhas, ...ficaram]
  // Com o que já voltou anotado: tentar de novo não confere nem regrava esses arquivos.
  diario.estado = completo ? 'desfeito' : 'desfazendo'
  await gravarDiario(portas, dirDiario, diario).catch((e: unknown) => {
    problemas.push(`Não deu para registrar o fim do desfazer (${String(e)}); se o botão continuar aparecendo, desfazer de novo é seguro.`)
  })
  return { planoId: diario.planoId, problemas, completo }
}

import type { EstadoSync } from './sync/sincronizador'
import type { FalhaAcao } from './sync/executar'
import type { FalhaDeGravacao } from './sync/ciclo'
import type { Acao } from './sync/tipos'
import type { Cenario, Personagem } from './types'

/**
 * O que a aba Nuvem MOSTRA, derivado do retrato que o sincronizador publica em `syncStore`.
 *
 * Puro de propósito, e fora de `lib/sync` porque não faz parte do motor. O store guarda dados
 * (`fase`, `freio`, `falhas`) e dado não é frase: a tradução para português de gente é a parte
 * que mais erra e a que mais importa — o freio de deleção em massa é o momento mais assustador
 * que este app tem, e ele chega aqui como `{ apagaria: 42, total: 50 }`. Separada do React, essa
 * tradução é testável sem montar componente nem subir o app.
 */

export type TomSync = 'ocupado' | 'ok' | 'atencao' | 'parado'

/** A linha de cima da aba: o que está acontecendo agora. */
export interface ResumoSync {
  tom: TomSync
  titulo: string
  /** Segunda linha, ou `null` quando o título já diz tudo. */
  detalhe: string | null
}

export type ChaveAviso = 'gravacoes' | 'freio' | 'erro' | 'falhas'

/** Um problema pendente, em bloco próprio. Vários podem estar de pé ao mesmo tempo. */
export interface AvisoSync {
  chave: ChaveAviso
  titulo: string
  paragrafos: string[]
  /** Arquivos ou motivos, um por linha. Vazio quando o aviso não tem lista. */
  itens: string[]
}

const MS_POR_DIA = 86_400_000

/**
 * Prefixo que `marcarComoCopia` (lib/sync/conflito.ts) põe no nome da cópia de conflito.
 * Repetido aqui porque lá ele é privado ao módulo; é o único acoplamento desta camada com a
 * política de conflito, e se ele mudar lá esta lista silenciosamente para de achar as cópias.
 */
const PREFIXO_DE_COPIA = '(conflito)'

function dois(n: number): string {
  return String(n).padStart(2, '0')
}

/** Dia do calendário local como número inteiro, para comparar datas sem comparar horas. */
function diaLocal(quando: Date): number {
  return Date.UTC(quando.getFullYear(), quando.getMonth(), quando.getDate()) / MS_POR_DIA
}

/**
 * "hoje às 14h32", "ontem às 09h05", "26/07 às 14h32". `null` se o ISO não for uma data.
 *
 * Sem ano e sem segundos: quem lê quer saber se o cofre está fresco, não a que instante exato o
 * ciclo terminou. Data inválida devolve `null` em vez de "Invalid Date" na cara do usuário.
 */
export function quandoFoi(iso: string, agora: Date): string | null {
  const quando = new Date(iso)
  if (Number.isNaN(quando.getTime())) return null
  const hora = `${dois(quando.getHours())}h${dois(quando.getMinutes())}`
  const dias = diaLocal(agora) - diaLocal(quando)
  if (dias === 0) return `hoje às ${hora}`
  if (dias === 1) return `ontem às ${hora}`
  return `${dois(quando.getDate())}/${dois(quando.getMonth() + 1)} às ${hora}`
}

function detalheDoUltimoSync(estado: EstadoSync, agora: Date): string | null {
  if (estado.ultimoSync === null) return null
  const quando = quandoFoi(estado.ultimoSync, agora)
  return quando === null ? null : `Última sincronização completa: ${quando}.`
}

/**
 * A frase principal da aba.
 *
 * A ordem dos testes é a do próprio ciclo (`executarCiclo`): ele descarrega as filas do app,
 * confere o pareamento e só então reconcilia. Quem barrou a rodada mais cedo é quem manda no
 * título — o resto vira aviso separado, porque o store faz merge raso e mais de um problema pode
 * estar de pé ao mesmo tempo (o freio só é limpo por um ciclo completo).
 */
export function resumirSync(estado: EstadoSync, agora: Date): ResumoSync {
  if (estado.fase === 'sincronizando') {
    return { tom: 'ocupado', titulo: 'Sincronizando…', detalhe: detalheDoUltimoSync(estado, agora) }
  }
  if (estado.gravacoesPendentes.length > 0) {
    return {
      tom: 'atencao',
      titulo: 'Sincronização adiada.',
      detalhe: 'Há alterações que ainda não chegaram ao disco deste computador.',
    }
  }
  if (!estado.pareado) {
    return {
      tom: 'parado',
      titulo: 'Este cofre ainda não está ligado ao Google Drive.',
      detalhe: 'Nada sobe nem desce enquanto ele não for ligado a uma pasta de lá.',
    }
  }
  if (estado.freio !== null) {
    return {
      tom: 'atencao',
      titulo: 'Sincronização parada por segurança.',
      detalhe: 'Nenhum arquivo foi apagado, nem aqui nem no Google Drive.',
    }
  }
  if (estado.ultimoErro !== null) {
    return {
      tom: 'atencao',
      titulo: 'Não foi possível sincronizar.',
      detalhe: detalheDoUltimoSync(estado, agora),
    }
  }
  if (estado.falhas.length > 0) {
    return {
      tom: 'atencao',
      titulo: 'Sincronizou, mas alguns arquivos ficaram para trás.',
      detalhe: detalheDoUltimoSync(estado, agora),
    }
  }
  if (estado.ultimoSync !== null) {
    return {
      tom: 'ok',
      titulo: 'Tudo em dia com o Google Drive.',
      detalhe: detalheDoUltimoSync(estado, agora),
    }
  }
  return {
    tom: 'parado',
    titulo: 'Ainda não sincronizou desde que o Grimório abriu.',
    detalhe: 'A primeira rodada acontece sozinha assim que houver algo a fazer.',
  }
}

/** O verbo do sync em português. Aparece na lista de ações que falharam. */
export function descreverAcao(acao: Acao): string {
  switch (acao.tipo) {
    case 'subir':
      return `enviar ${acao.caminho}`
    case 'baixar':
      return `baixar ${acao.caminho}`
    case 'apagarLocal':
      return `apagar ${acao.caminho} deste computador`
    case 'apagarRemoto':
      return `apagar ${acao.caminho} do Google Drive`
    case 'conflito':
      return `resolver as duas versões de ${acao.caminho}`
    case 'registrar':
      return `anotar ${acao.caminho}`
  }
}

function avisoDeGravacoes(pendentes: FalhaDeGravacao[]): AvisoSync {
  return {
    chave: 'gravacoes',
    titulo: 'Alterações que não chegaram ao disco',
    paragrafos: [
      'O Grimório não conseguiu salvar estas alterações no seu computador, e por isso não sincronizou nada: subir o cofre agora mandaria para o Google Drive uma versão mais velha do que a que você escreveu.',
      'Abra cada item, confira se o texto está como você deixou e salve de novo. Se continuar falhando, o disco pode estar cheio ou a pasta do cofre pode estar somente para leitura.',
    ],
    // `rotulo` é o nome que o usuário reconhece ("Bruce Wayne"); o caminho é o resgate quando
    // a gravação falhou antes de a entidade ter nome.
    itens: pendentes.map((p) => p.rotulo || p.caminho),
  }
}

/**
 * O freio de deleção em massa. É o aviso mais importante da aba inteira.
 *
 * Ele NÃO oferece "apagar mesmo assim": quando `reconciliar` recusa, o plano volta sem as ações
 * (`Plano` só carrega `acoes` no ramo `ok`), então não existe nada guardado para confirmar. O que
 * a tela pode fazer é explicar o que foi impedido, com os números, e dizer onde olhar.
 */
function avisoDoFreio(freio: { apagaria: number; total: number }): AvisoSync {
  return {
    chave: 'freio',
    titulo: 'Sincronização parada por segurança',
    paragrafos: [
      `Para deixar este computador e o Google Drive iguais, o Grimório teria que apagar ${freio.apagaria} dos ${freio.total} arquivos que ele conhece deste cofre. É apagar demais de uma vez, então ele parou antes de mexer em qualquer coisa: nada foi apagado, nem aqui nem no Drive.`,
      'Quase sempre isso quer dizer que os arquivos não sumiram de verdade — a pasta do cofre no Google Drive foi esvaziada, renomeada, movida para a lixeira ou trocada por outra.',
      'Abra o Google Drive e confira se os arquivos continuam lá. Enquanto isso o Grimório não apaga nada por conta própria, e se estiver tudo no lugar a próxima sincronização volta ao normal sozinha.',
    ],
    itens: [],
  }
}

function avisoDeErro(erro: string): AvisoSync {
  return {
    chave: 'erro',
    titulo: 'Não foi possível sincronizar',
    paragrafos: [
      'A última tentativa não chegou ao fim. O Grimório continua funcionando normalmente e tudo que você escrever fica salvo aqui no computador — ele tenta de novo sozinho daqui a pouco.',
    ],
    // A mensagem crua entra como item: costuma vir do Rust, já em português, e é o único fio
    // que distingue "sem internet" de "a pasta do Drive foi apagada".
    itens: [erro],
  }
}

function avisoDeFalhas(falhas: FalhaAcao[]): AvisoSync {
  return {
    chave: 'falhas',
    titulo: 'Arquivos que ficaram para trás',
    paragrafos: [
      'O resto do cofre sincronizou normalmente. Só estes não deram certo, e vão ser tentados de novo na próxima rodada:',
    ],
    itens: falhas.map((f) => `${descreverAcao(f.acao)} — ${f.erro}`),
  }
}

/**
 * Os problemas de pé, do mais cedo no ciclo para o mais tarde. Lista e não escolha única porque
 * `publicarSync` faz merge raso: uma rodada que bate no freio não limpa o erro da anterior, e
 * esconder um deles faria o usuário resolver metade do problema e achar que acabou.
 */
export function avisosDoSync(estado: EstadoSync): AvisoSync[] {
  const avisos: AvisoSync[] = []
  if (estado.gravacoesPendentes.length > 0) avisos.push(avisoDeGravacoes(estado.gravacoesPendentes))
  if (estado.freio !== null) avisos.push(avisoDoFreio(estado.freio))
  if (estado.ultimoErro !== null) avisos.push(avisoDeErro(estado.ultimoErro))
  if (estado.falhas.length > 0) avisos.push(avisoDeFalhas(estado.falhas))
  return avisos
}

export interface CopiaDeConflito {
  tipo: 'personagem' | 'cenario'
  id: string
  nome: string
}

/**
 * As cópias de conflito que estão no cofre agora, achadas pelo prefixo do nome.
 *
 * A lista vem do cofre carregado, e não do ciclo que a criou, porque `EstadoSync` não tem campo
 * para os `resolvidos()` do preservador — e mesmo que tivesse, ele seria da sessão: quem fecha o
 * app e volta no dia seguinte encontraria a lista vazia com as cópias ainda lá. Procurar pelo
 * nome acha a cópia enquanto ela existir.
 *
 * Só personagem e cenário: são as duas entidades que a política `entidade` marca com o prefixo e
 * as duas que o app sabe abrir por id.
 */
export function copiasDeConflito(
  personagens: Record<string, Personagem>,
  cenarios: Record<string, Cenario>,
): CopiaDeConflito[] {
  const todas: CopiaDeConflito[] = [
    ...Object.values(personagens).map((p) => ({ tipo: 'personagem' as const, id: p.id, nome: p.nome })),
    ...Object.values(cenarios).map((c) => ({ tipo: 'cenario' as const, id: c.id, nome: c.nome })),
  ]
  return todas
    .filter((c) => c.nome.startsWith(PREFIXO_DE_COPIA))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

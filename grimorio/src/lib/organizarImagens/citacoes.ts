import type { FsBridge } from '../fsBridge'
import { DIR_LIXEIRA } from '../lixeira'
import { chaveCaminho } from './nomes'
import { paraCadaString, relsEmHtml } from './referencias'

/**
 * A checagem única de citação de imagem.
 *
 * Regra que ela guarda: **nenhum arquivo de imagem é sobrescrito nem apagado enquanto outra ficha,
 * versão ou nota ainda o cita.** Trocar o retrato, tirar da galeria, organizar e desfazer perguntam
 * todos a este arquivo — com uma regra só, não há um caminho que apague o que o outro protegeria.
 *
 * "Citar" é a mesma leitura do planejador: string igual ao caminho da imagem (sem caixa, NFC, como o
 * NTFS compara) ou `data-rel` de uma imagem num HTML. Pedaço de string não conta.
 *
 * Na dúvida, cita: JSON que não dá para parsear, mas que tem o caminho no texto cru, conta como
 * citação; JSON que nem dá para ler (travado, sem permissão) conta como citação de todas. Quem tem
 * como adiar em vez de manter — o sync do Drive — pergunta a `apurarCitacoes`, que devolve esse
 * ilegível à parte.
 */

/** Todo arquivo do cofre (`rel`), sem pasta com ponto — menos a lixeira, que ainda cita imagem. */
export async function listarCofre(raiz: string, fs: FsBridge): Promise<string[]> {
  const saida: string[] = []
  async function descer(rel: string): Promise<void> {
    const abs = rel === '' ? raiz : `${raiz}/${rel}`
    for (const e of await fs.listDir(abs)) {
      const filho = rel === '' ? e.name : `${rel}/${e.name}`
      if (e.isDir) {
        if (e.name.startsWith('.') && !(rel === '' && e.name === DIR_LIXEIRA)) continue
        await descer(filho)
      } else {
        saida.push(filho)
      }
    }
  }
  await descer('')
  return saida.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Quantas vezes `rel` é citado dentro de um valor (ficha em memória, JSON já lido). */
export function contarCitacoes(valor: unknown, rel: string): number {
  const alvo = chaveCaminho(rel)
  let n = 0
  paraCadaString(valor, (s) => {
    if (chaveCaminho(s) === alvo) n += 1
    for (const r of relsEmHtml(s)) if (chaveCaminho(r) === alvo) n += 1
  })
  return n
}

function ehJson(rel: string): boolean {
  return rel.toLowerCase().endsWith('.json')
}

/**
 * `rel` estaria na lista de `listarCofre`? Nenhuma pasta do caminho começa com ponto, menos a
 * lixeira na raiz. É a mesma regra, para quem já tem a varredura do cofre e não precisa listar o
 * disco de novo.
 */
function entraNoCofre(rel: string): boolean {
  const pastas = rel.split('/').slice(0, -1)
  return pastas.every((pasta, i) => !pasta.startsWith('.') || (i === 0 && pasta === DIR_LIXEIRA))
}

/**
 * Lê cada um dos `arquivos`, na ordem, e conta a quem pergunta: `aoLer` com os `rels` que ele cita,
 * ou `aoFalhar` quando não deu para ler (travado, sem permissão, sumiu). O que fazer com o ilegível
 * é de quem pergunta — `quemCita` e `apurarCitacoes` decidem diferente.
 */
async function varrerCitacoes(
  raiz: string,
  fs: FsBridge,
  rels: string[],
  arquivos: string[],
  aoLer: (arquivo: string, citados: Set<string>) => void,
  aoFalhar: (arquivo: string) => void,
): Promise<void> {
  const porChave = new Map<string, string>()
  for (const rel of rels) porChave.set(chaveCaminho(rel), rel)
  for (const arquivo of arquivos) {
    let texto: string
    try {
      texto = await fs.readText(`${raiz}/${arquivo}`)
    } catch {
      aoFalhar(arquivo)
      continue
    }
    const achados = new Set<string>()
    try {
      paraCadaString(JSON.parse(texto.replace(/^﻿/, '')), (s) => {
        const direto = porChave.get(chaveCaminho(s))
        if (direto !== undefined) achados.add(direto)
        for (const r of relsEmHtml(s)) {
          const emHtml = porChave.get(chaveCaminho(r))
          if (emHtml !== undefined) achados.add(emHtml)
        }
      })
    } catch {
      // Ilegível: não dá para saber o campo, mas dá para ver se o caminho está lá.
      const cru = texto.normalize('NFC').toLowerCase()
      for (const [chave, rel] of porChave) {
        if (cru.includes(chave) || cru.includes(JSON.stringify(chave).slice(1, -1))) achados.add(rel)
      }
    }
    aoLer(arquivo, achados)
  }
}

/**
 * Para cada um dos `rels`, os arquivos do cofre que o citam — fora os de `ignorar` (quem vai ser
 * reescrito ou devolvido pelo próprio chamador). A chave do mapa é o `rel` como foi pedido.
 */
export async function quemCita(
  raiz: string,
  fs: FsBridge,
  rels: string[],
  ignorar: string[] = [],
): Promise<Map<string, string[]>> {
  const saida = new Map<string, string[]>()
  for (const rel of rels) saida.set(rel, [])
  if (rels.length === 0) return saida
  const pular = new Set(ignorar.map(chaveCaminho))
  const arquivos = (await listarCofre(raiz, fs)).filter((a) => ehJson(a) && !pular.has(chaveCaminho(a)))
  await varrerCitacoes(
    raiz,
    fs,
    rels,
    arquivos,
    (arquivo, citados) => {
      for (const rel of citados) saida.get(rel)?.push(arquivo)
    },
    // Travado ou sem permissão: não dá para saber o que cita. Na dúvida, cita tudo — quem pergunta
    // deixa a imagem onde está, em vez de a checagem inteira cair (e levar a operação junto).
    (arquivo) => {
      for (const rel of rels) saida.get(rel)?.push(arquivo)
    },
  )
  return saida
}

/** O que `apurarCitacoes` achou: quem cita, lido de verdade, e quem não deu para ler. */
export interface CitacoesApuradas {
  /** Para cada `rel` pedido (a chave é o `rel` como foi pedido), os arquivos LIDOS que o citam. */
  citantes: Map<string, string[]>
  /** `.json` que não deu para ler: pode citar qualquer um dos `rels`, e não há como saber qual. */
  ilegiveis: string[]
}

/**
 * A leitura de `quemCita` sem decidir pela dúvida: o `.json` que não deu para ler vem à parte, em
 * vez de contar como citação de tudo. É para quem tem uma terceira saída além de apagar e manter —
 * o sync pode adiar para o ciclo seguinte, e um arquivo travado por um instante (antivírus, o
 * autosave gravando) não pode fazer a organização inteira do outro PC voltar ao Drive.
 *
 * `arquivos` é para quem já tem a varredura do cofre na mão: dela só vale o que `listarCofre` veria,
 * e o disco não é listado de novo. Arquivo da lista que sumiu do disco cai em `ilegiveis`, porque
 * pode ter ido para outro caminho que ninguém leu (a lixeira também cita imagem). Sem `arquivos`, a
 * função lista o disco como `quemCita`.
 */
export async function apurarCitacoes(
  raiz: string,
  fs: FsBridge,
  rels: string[],
  arquivos?: string[],
): Promise<CitacoesApuradas> {
  const citantes = new Map<string, string[]>()
  for (const rel of rels) citantes.set(rel, [])
  const ilegiveis: string[] = []
  if (rels.length === 0) return { citantes, ilegiveis }
  // `.sort()` compara por unidade de código, a mesma ordem de `listarCofre`
  const candidatos = arquivos === undefined
    ? await listarCofre(raiz, fs)
    : [...new Set(arquivos)].filter(entraNoCofre).sort()
  await varrerCitacoes(
    raiz,
    fs,
    rels,
    candidatos.filter(ehJson),
    (arquivo, citados) => {
      for (const rel of citados) citantes.get(rel)?.push(arquivo)
    },
    (arquivo) => {
      ilegiveis.push(arquivo)
    },
  )
  return { citantes, ilegiveis }
}

export interface OpcoesCitacaoUnica {
  raiz: string
  fs: FsBridge
  /**
   * A entidade aberta, que pode estar à frente do disco (versão recém-clonada ainda no debounce).
   * `permitidas` é quantas citações dela são a que está sendo trocada ou removida — em geral 1.
   * O arquivo dela no disco não é lido: a memória manda.
   */
  emMemoria?: { valor: unknown; arquivo: string | null; permitidas: number }
  /** Arquivos que o chamador vai reescrever ou devolver, e por isso não contam. */
  ignorar?: string[]
}

/**
 * `rel` pode ser sobrescrito ou apagado? Só se ninguém mais o cita: na entidade em memória no
 * máximo as `permitidas`, e em nenhum outro arquivo do cofre. Entidade sem arquivo conhecido não
 * dá para separar do disco — responde que não pode.
 */
export async function citacaoUnica(rel: string, opcoes: OpcoesCitacaoUnica): Promise<boolean> {
  const { raiz, fs, emMemoria, ignorar = [] } = opcoes
  if (emMemoria !== undefined) {
    if (emMemoria.arquivo === null) return false
    if (contarCitacoes(emMemoria.valor, rel) > emMemoria.permitidas) return false
  }
  const pular = emMemoria?.arquivo ? [...ignorar, emMemoria.arquivo] : ignorar
  return ((await quemCita(raiz, fs, [rel], pular)).get(rel) ?? []).length === 0
}

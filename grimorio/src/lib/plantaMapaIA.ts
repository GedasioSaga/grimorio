/**
 * Núcleo PURO da "IA monta o mapa": o formato da planta que a IA devolve, o parse e a
 * validação da resposta, a detecção de sobreposição entre salas, e a conversão da planta
 * em especificações de shape (ainda sem px, sem id de tldraw, sem editor).
 *
 * Deliberadamente sem NENHUMA dependência de tldraw/React: `createShapeId`, `editor` e a
 * leitura de imagem do disco ficam no módulo de I/O (`gerarMapaIA.ts`), que é quem sabe
 * conversar com o app. Este arquivo só sabe number/string/array — é o que permite testar
 * "JSON malformado", "estado desconhecido" etc. sem montar editor nenhum (o tldraw não
 * roda em jsdom — ver HANDOFF.md).
 *
 * A IDEIA CENTRAL do recurso: a IA nunca desenha. Ela devolve cômodos em coordenada de
 * GRADE (inteiros), e é o app que converte isso nas peças que a toolbar já cria — o
 * estilo sai idêntico ao do usuário por construção, e o erro possível vira "a sala está no
 * lugar errado" (verificável, o usuário arrasta), nunca "a IA desenhou feio".
 */

import { ESTADOS_SALA, type EstadoSala } from './salaMapa'
import { ESTADOS_PORTA, type EstadoPorta } from './portaMapa'
import { ehSimboloConhecido, type SimboloId } from './simbolosMapa'
import type { Caixa } from './quadrados'

/**
 * Uma lista só, a de verdade. Uma versão anterior copiava estes três valores para cá porque
 * o original vivia em `components/PortaShape.tsx`, que importa tldraw — e um módulo puro não
 * pode arrastar o editor junto. A saída não era duplicar: era mover o estado da porta para a
 * lib pura (`portaMapa.ts`), onde o da sala sempre esteve. Com duas listas, a primeira porta
 * de estado novo passaria a ser rejeitada aqui em silêncio.
 */
export type EstadoPortaIA = EstadoPorta

/** Maior coordenada/tamanho aceito, em quadrados. Acima disso é "coordenada absurda". */
const MAX_QUADRADOS = 400

/**
 * Tetos de VOLUME. Validar tipo sem validar tamanho é meia validação: uma resposta com todo
 * campo no tipo certo e todo estado na lista certa ainda trava o editor.
 *
 * `MAX_ROTULO` — o rótulo vira `<text>` SVG dentro da sala, uma linha por quebra
 * (`quebrarRotulo`, salaMapa.ts). Medido numa revisão: 1 MB de rótulo produz 41.667 linhas, ou
 * seja, 41.667 nós DOM para UMA sala. Nome de cômodo não passa de uma frase.
 *
 * `MAX_PECAS` — `contarSalasSobrepostas` é O(n²) e roda síncrona na thread da interface logo
 * depois do parse. Medido: 20.000 salas custam 367 ms só ali, antes de criar shape nenhum. E
 * `MAX_QUADRADOS` permite ~160.000 células, então "modelo detalhista devolve milhares de salas
 * 1×1" é resposta plausível, não ataque.
 */
const MAX_ROTULO = 200
const MAX_PECAS = 300

export interface SalaPlantaIA {
  x: number
  y: number
  w: number
  h: number
  rotulo: string
  estado: EstadoSala
}

export interface PortaPlantaIA {
  x: number
  y: number
  orientacao: 'horizontal' | 'vertical'
  estado: EstadoPortaIA
}

export interface SimboloPlantaIA {
  x: number
  y: number
  simbolo: SimboloId
  /** só usado por marcador (número) e rótulo de andar (texto); vazio nos demais */
  rotulo: string
}

export interface PlantaIA {
  salas: SalaPlantaIA[]
  portas: PortaPlantaIA[]
  simbolos: SimboloPlantaIA[]
}

export type ResultadoParsePlanta = { ok: true; planta: PlantaIA } | { ok: false; erro: string }

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Inteiro dentro de [0, MAX_QUADRADOS] — cobre "campo ausente", "tipo errado" e "coordenada absurda". */
function inteiroValido(v: unknown, max = MAX_QUADRADOS): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max
}

/** Tamanho (w/h): inteiro estritamente positivo — cobre "zero" e "negativo". */
function tamanhoValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_QUADRADOS
}

/**
 * Alguns modelos ecoam ```json ... ``` mesmo quando o prompt pede JSON cru. Tirar a cerca
 * ANTES do `JSON.parse` é mais barato do que fazer o modelo acertar de primeira sempre.
 */
function limparCercaMarkdown(texto: string): string {
  const aparado = texto.trim()
  // sem âncoras: uma versão anterior exigia que a cerca envolvesse a resposta INTEIRA, e aí
  // "Claro! Aqui está o mapa:\n```json\n{…}\n```" — que é a saída típica de um modelo barato —
  // era rejeitada como "não é JSON válido", com o JSON perfeito ali dentro.
  const comCerca = aparado.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (comCerca) return comCerca[1].trim()
  // cerca aberta e nunca fechada, ou prosa em volta do JSON cru: recorta do primeiro `{` ao
  // último `}`. Num JSON já limpo isso devolve a própria string, então não custa nada.
  const abre = aparado.indexOf('{')
  const fecha = aparado.lastIndexOf('}')
  return abre >= 0 && fecha > abre ? aparado.slice(abre, fecha + 1) : aparado
}

/**
 * Parseia e valida a resposta da IA. TUDO ou NADA: um campo ruim invalida a planta
 * inteira (a peça teria coordenada ou estado sem sentido, e inserir mesmo assim seria pior
 * que avisar). Isso é diferente de sobreposição ENTRE salas válidas — essa é aceita e só
 * contada (ver `contarSalasSobrepostas`), porque cada sala isolada continua sendo uma
 * peça válida.
 */
export function parsearPlantaIA(texto: string): ResultadoParsePlanta {
  let bruto: unknown
  try {
    bruto = JSON.parse(limparCercaMarkdown(texto))
  } catch {
    return { ok: false, erro: 'A resposta da IA não é um JSON válido.' }
  }
  if (!ehObjeto(bruto)) return { ok: false, erro: 'A resposta da IA não é um objeto JSON.' }

  const salasBrutas = bruto.salas ?? []
  const portasBrutas = bruto.portas ?? []
  const simbolosBrutos = bruto.simbolos ?? []
  if (!Array.isArray(salasBrutas)) return { ok: false, erro: 'O campo "salas" precisa ser uma lista.' }
  if (!Array.isArray(portasBrutas)) return { ok: false, erro: 'O campo "portas" precisa ser uma lista.' }
  if (!Array.isArray(simbolosBrutos)) return { ok: false, erro: 'O campo "simbolos" precisa ser uma lista.' }

  // teto ANTES de percorrer: a checagem de sobreposição adiante é O(n²) e roda síncrona na
  // thread da interface, então uma planta gigante travaria a tela sem nem chegar a desenhar
  const total = salasBrutas.length + portasBrutas.length + simbolosBrutos.length
  if (total > MAX_PECAS) {
    return {
      ok: false,
      erro: `A IA devolveu ${total} peças, acima do limite de ${MAX_PECAS}. Peça um mapa menor, ou divida em andares.`,
    }
  }

  const salas: SalaPlantaIA[] = []
  for (let i = 0; i < salasBrutas.length; i++) {
    const s = salasBrutas[i]
    if (!ehObjeto(s)) return { ok: false, erro: `Sala ${i + 1}: item não é um objeto.` }
    if (!inteiroValido(s.x) || !inteiroValido(s.y)) {
      return { ok: false, erro: `Sala ${i + 1}: "x"/"y" ausente, não inteiro, ou coordenada absurda.` }
    }
    if (!tamanhoValido(s.w) || !tamanhoValido(s.h)) {
      return { ok: false, erro: `Sala ${i + 1}: "w"/"h" precisa ser inteiro maior que zero.` }
    }
    if (typeof s.rotulo !== 'string') return { ok: false, erro: `Sala ${i + 1}: "rotulo" precisa ser texto.` }
    // o rótulo vira uma linha de <text> SVG por quebra dentro da sala; sem teto, um rótulo
    // quilométrico gera dezenas de milhares de nós DOM para um cômodo só
    if (s.rotulo.length > MAX_ROTULO) {
      return { ok: false, erro: `Sala ${i + 1}: nome de cômodo com mais de ${MAX_ROTULO} caracteres.` }
    }
    if (!(ESTADOS_SALA as string[]).includes(s.estado as string)) {
      return { ok: false, erro: `Sala ${i + 1}: estado "${String(s.estado)}" desconhecido.` }
    }
    salas.push({ x: s.x, y: s.y, w: s.w, h: s.h, rotulo: s.rotulo, estado: s.estado as EstadoSala })
  }

  const portas: PortaPlantaIA[] = []
  for (let i = 0; i < portasBrutas.length; i++) {
    const p = portasBrutas[i]
    if (!ehObjeto(p)) return { ok: false, erro: `Porta ${i + 1}: item não é um objeto.` }
    if (!inteiroValido(p.x) || !inteiroValido(p.y)) {
      return { ok: false, erro: `Porta ${i + 1}: "x"/"y" ausente, não inteiro, ou coordenada absurda.` }
    }
    if (p.orientacao !== 'horizontal' && p.orientacao !== 'vertical') {
      return { ok: false, erro: `Porta ${i + 1}: "orientacao" precisa ser "horizontal" ou "vertical".` }
    }
    if (!(ESTADOS_PORTA as string[]).includes(p.estado as string)) {
      return { ok: false, erro: `Porta ${i + 1}: estado "${String(p.estado)}" desconhecido.` }
    }
    portas.push({ x: p.x, y: p.y, orientacao: p.orientacao, estado: p.estado as EstadoPortaIA })
  }

  const simbolos: SimboloPlantaIA[] = []
  for (let i = 0; i < simbolosBrutos.length; i++) {
    const sb = simbolosBrutos[i]
    if (!ehObjeto(sb)) return { ok: false, erro: `Símbolo ${i + 1}: item não é um objeto.` }
    if (!inteiroValido(sb.x) || !inteiroValido(sb.y)) {
      return { ok: false, erro: `Símbolo ${i + 1}: "x"/"y" ausente, não inteiro, ou coordenada absurda.` }
    }
    if (typeof sb.simbolo !== 'string' || !ehSimboloConhecido(sb.simbolo)) {
      return { ok: false, erro: `Símbolo ${i + 1}: "${String(sb.simbolo)}" não é um símbolo conhecido.` }
    }
    if (sb.rotulo !== undefined && typeof sb.rotulo !== 'string') {
      return { ok: false, erro: `Símbolo ${i + 1}: "rotulo" precisa ser texto.` }
    }
    if (typeof sb.rotulo === 'string' && sb.rotulo.length > MAX_ROTULO) {
      return { ok: false, erro: `Símbolo ${i + 1}: rótulo com mais de ${MAX_ROTULO} caracteres.` }
    }
    simbolos.push({ x: sb.x, y: sb.y, simbolo: sb.simbolo, rotulo: typeof sb.rotulo === 'string' ? sb.rotulo : '' })
  }

  if (salas.length === 0 && portas.length === 0 && simbolos.length === 0) {
    return { ok: false, erro: 'A IA não descreveu nenhuma peça de mapa.' }
  }

  return { ok: true, planta: { salas, portas, simbolos } }
}

/** Duas caixas se sobrepõem em ÁREA (encostar pela borda não conta). */
function sobrepoemEmArea(a: Caixa, b: Caixa): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Quantas salas participam de pelo menos uma sobreposição com outra sala.
 *
 * Só salas contam: porta e símbolo pousam DE PROPÓSITO sobre a sala (a porta na parede, o
 * item dentro do cômodo) — sobreposição ali é o funcionamento normal, não erro da IA.
 */
export function contarSalasSobrepostas(salas: SalaPlantaIA[]): number {
  const sobrepostas = new Set<number>()
  for (let i = 0; i < salas.length; i++) {
    for (let j = i + 1; j < salas.length; j++) {
      if (sobrepoemEmArea(salas[i], salas[j])) {
        sobrepostas.add(i)
        sobrepostas.add(j)
      }
    }
  }
  return sobrepostas.size
}

/**
 * Caixa (em quadrados) que envolve a planta inteira. Porta e símbolo entram como célula
 * 1×1 (o desenho real deles é menor que um quadrado e fica centrado nele — decisão do
 * módulo de I/O); o que importa aqui é só o tamanho do bloco pra achar área livre.
 */
export function bboxDaPlantaEmQuadrados(planta: PlantaIA): Caixa {
  const caixas: Caixa[] = [
    ...planta.salas.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
    ...planta.portas.map((p) => ({ x: p.x, y: p.y, w: 1, h: 1 })),
    ...planta.simbolos.map((s) => ({ x: s.x, y: s.y, w: 1, h: 1 })),
  ]
  if (caixas.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const minX = Math.min(...caixas.map((c) => c.x))
  const minY = Math.min(...caixas.map((c) => c.y))
  const maxX = Math.max(...caixas.map((c) => c.x + c.w))
  const maxY = Math.max(...caixas.map((c) => c.y + c.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * Ponto (em quadrados) onde a planta pode nascer sem encostar em nada que já existe.
 *
 * Tenta o ponto PREFERIDO primeiro (perto da viewport, é melhor pro usuário). Se colidir,
 * não faz busca sofisticada: nasce à direita do bloco de tudo que já existe, alinhada pelo
 * topo — garante ausência de sobreposição por construção (a nova caixa fica inteiramente
 * à direita da mais à direita), o suficiente pra decisão 3 ("nasce em área vazia").
 */
export function proximaAreaLivre(
  obstaculos: Caixa[],
  tamanho: { w: number; h: number },
  preferido: { x: number; y: number },
  margem: number,
): { x: number; y: number } {
  const candidata: Caixa = { x: preferido.x - margem, y: preferido.y - margem, w: tamanho.w + margem * 2, h: tamanho.h + margem * 2 }
  const semColisao = obstaculos.every((o) => !sobrepoemEmArea(candidata, o))
  if (semColisao || obstaculos.length === 0) return { x: preferido.x, y: preferido.y }

  const maxX = Math.max(...obstaculos.map((o) => o.x + o.w))
  const minY = Math.min(...obstaculos.map((o) => o.y))
  return { x: maxX + margem, y: minY }
}

export interface EspecificacaoSalaIA {
  tipo: 'sala'
  xQuad: number
  yQuad: number
  wQuad: number
  hQuad: number
  props: { estado: EstadoSala; rotulo: string; cor: '' }
}

export interface EspecificacaoPortaIA {
  tipo: 'porta'
  /** célula (1×1) onde a porta pousa; o módulo de I/O centraliza a barra dentro dela */
  xQuad: number
  yQuad: number
  orientacao: 'horizontal' | 'vertical'
  props: { estado: EstadoPortaIA }
}

export interface EspecificacaoSimboloIA {
  tipo: 'simbolo'
  xQuad: number
  yQuad: number
  simbolo: SimboloId
  props: { rotulo: string }
}

export type EspecificacaoFormaIA = EspecificacaoSalaIA | EspecificacaoPortaIA | EspecificacaoSimboloIA

/**
 * Planta validada → lista de especificações de shape, já deslocadas para nascer em
 * `origem` (o canto superior-esquerdo do bloco da planta cai exatamente ali — a busca de
 * área livre acima trabalha em cima do bbox, não das coordenadas cruas da IA).
 *
 * Marcador sem `rotulo`: numerado a partir de `proximoMarcadorInicial`, na ORDEM em que
 * aparece na planta — mesma regra de `proximoNumero` (somar ao maior existente), só que
 * aplicada aqui porque o "maior existente" é responsabilidade de quem já olha o mapa
 * (o módulo de I/O, que tem o editor à mão).
 */
export function plantaParaEspecificacoes(
  planta: PlantaIA,
  origem: { xQuad: number; yQuad: number },
  proximoMarcadorInicial = 1,
): EspecificacaoFormaIA[] {
  const bbox = bboxDaPlantaEmQuadrados(planta)
  const dx = origem.xQuad - bbox.x
  const dy = origem.yQuad - bbox.y

  const especificacoes: EspecificacaoFormaIA[] = []

  for (const s of planta.salas) {
    especificacoes.push({
      tipo: 'sala',
      xQuad: s.x + dx,
      yQuad: s.y + dy,
      wQuad: s.w,
      hQuad: s.h,
      props: { estado: s.estado, rotulo: s.rotulo, cor: '' },
    })
  }

  for (const p of planta.portas) {
    especificacoes.push({
      tipo: 'porta',
      xQuad: p.x + dx,
      yQuad: p.y + dy,
      orientacao: p.orientacao,
      props: { estado: p.estado },
    })
  }

  let proximoMarcador = proximoMarcadorInicial
  for (const sb of planta.simbolos) {
    const rotulo = sb.simbolo === 'marcador' && !sb.rotulo ? String(proximoMarcador++) : sb.rotulo
    especificacoes.push({
      tipo: 'simbolo',
      xQuad: sb.x + dx,
      yQuad: sb.y + dy,
      simbolo: sb.simbolo,
      props: { rotulo },
    })
  }

  return especificacoes
}

/** Resumo em português do que foi (ou seria) inserido — mostrado ao usuário após gerar. */
export function formatarResumoInsercao(planta: PlantaIA, salasSobrepostas: number): string {
  const partes: string[] = []
  if (planta.salas.length) partes.push(`${planta.salas.length} sala${planta.salas.length === 1 ? '' : 's'}`)
  if (planta.portas.length) partes.push(`${planta.portas.length} porta${planta.portas.length === 1 ? '' : 's'}`)
  if (planta.simbolos.length) partes.push(`${planta.simbolos.length} símbolo${planta.simbolos.length === 1 ? '' : 's'}`)
  const corpo = partes.length ? partes.join(', ') : 'nada'
  const aviso = salasSobrepostas > 0 ? ` ATENÇÃO: ${salasSobrepostas} sala(s) ficaram sobrepostas — confira e ajuste.` : ''
  return `Inserido: ${corpo}.${aviso}`
}

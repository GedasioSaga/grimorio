/**
 * Onde uma porta se encaixa numa parede — geometria pura, sem tldraw.
 *
 * ## Por que existe
 *
 * A porta era um retângulo colorido pousado por cima da planta: o mestre arrastava até perto
 * da parede, girava à mão para acertar o eixo, e ajustava o encosto. Três gestos por porta;
 * numa planta de doze cômodos com quinze portas, quarenta e cinco gestos que existem só
 * porque a peça não sabe onde mora.
 *
 * O preço maior não é o gesto, é a leitura na mesa: uma porta pousada sobre um contorno
 * contínuo não abre passagem nenhuma. O jogador pergunta "esse quarto tem saída?" olhando
 * para um desenho que responde que não.
 *
 * ## O que este módulo decide, e o que não decide
 *
 * Aqui só entra a conta: dadas as arestas das peças candidatas e um ponto, qual aresta está
 * mais perto, onde exatamente sobre ela, em que ângulo, e a que fração do comprimento. Quem
 * lê o editor, escreve `meta` e desenha o vão é o shape — isto fica testável sem montar nada.
 *
 * A fração `t` (0..1 ao longo da aresta) é o que faz o vínculo sobreviver: guardando `t` em
 * vez de coordenada absoluta, mover ou redimensionar a parede reposiciona a porta sozinha, no
 * mesmo ponto relativo. Guardar coordenada faria a porta ficar para trás na primeira vez que
 * o cômodo mudasse de tamanho.
 */

export interface Ponto {
  x: number
  y: number
}

export interface Aresta {
  a: Ponto
  b: Ponto
}

/** Peça que pode hospedar uma porta, já com as arestas em espaço de PÁGINA. */
export interface HospedeiroCandidato {
  id: string
  arestas: Aresta[]
}

export interface Ancoragem {
  hospedeiroId: string
  /** índice da aresta dentro de `arestas` do hospedeiro */
  indiceAresta: number
  /** posição ao longo da aresta, 0 na ponta `a` e 1 na ponta `b` */
  t: number
  /** ponto de encosto, em espaço de página */
  ponto: Ponto
  /** rotação da porta, em radianos, alinhada à direção da aresta */
  angulo: number
  /** distância do ponto consultado até a aresta, em px de página */
  distancia: number
}

/** As quatro arestas de uma caixa `w`×`h`, em sentido horário a partir do canto superior-esquerdo. */
export function arestasDeCaixa(w: number, h: number): Aresta[] {
  return [
    { a: { x: 0, y: 0 }, b: { x: w, y: 0 } },
    { a: { x: w, y: 0 }, b: { x: w, y: h } },
    { a: { x: w, y: h }, b: { x: 0, y: h } },
    { a: { x: 0, y: h }, b: { x: 0, y: 0 } },
  ]
}

/** As arestas de um polígono fechado — a última liga o fim ao começo. */
export function arestasDePoligono(pontos: Ponto[]): Aresta[] {
  if (pontos.length < 3) return []
  return pontos.map((p, i) => ({ a: p, b: pontos[(i + 1) % pontos.length] }))
}

/**
 * Projeta `ponto` no segmento, limitando às pontas.
 *
 * O limite (`clamp` de `t` em 0..1) é o que impede a porta de encaixar no PROLONGAMENTO da
 * parede: sem ele, um ponto além do canto ainda daria distância pequena até a reta infinita,
 * e a porta grudaria no vazio, alinhada a uma parede que termina metros antes.
 */
export function projetarNaAresta(ponto: Ponto, aresta: Aresta): { t: number; ponto: Ponto; distancia: number } {
  const dx = aresta.b.x - aresta.a.x
  const dy = aresta.b.y - aresta.a.y
  const comprimento2 = dx * dx + dy * dy

  // aresta degenerada (dois vértices no mesmo lugar): a projeção é a própria ponta
  if (comprimento2 === 0) {
    return {
      t: 0,
      ponto: { ...aresta.a },
      distancia: Math.hypot(ponto.x - aresta.a.x, ponto.y - aresta.a.y),
    }
  }

  const bruto = ((ponto.x - aresta.a.x) * dx + (ponto.y - aresta.a.y) * dy) / comprimento2
  const t = Math.min(1, Math.max(0, bruto))
  const emCima = { x: aresta.a.x + t * dx, y: aresta.a.y + t * dy }
  return { t, ponto: emCima, distancia: Math.hypot(ponto.x - emCima.x, ponto.y - emCima.y) }
}

/** Ângulo da aresta, em radianos. É a rotação que alinha a porta à parede. */
export function anguloDaAresta(aresta: Aresta): number {
  return Math.atan2(aresta.b.y - aresta.a.y, aresta.b.x - aresta.a.x)
}

/**
 * A melhor parede para encostar `ponto`, ou `null` se nenhuma estiver dentro de `alcance`.
 *
 * O alcance é o que mantém o gesto reversível: fora dele a porta continua solta e livre, e o
 * mestre pode deixá-la onde quiser. Ancoragem que acontece longe demais vira ímã, e ímã que
 * o usuário não pediu é pior que nenhum encaixe.
 *
 * Empate é resolvido pela PRIMEIRA aresta na ordem dos candidatos, o que na prática favorece
 * a peça mais ao topo da pilha — a que o usuário está enxergando.
 */
export function melhorAncora(
  ponto: Ponto,
  candidatos: HospedeiroCandidato[],
  alcance: number,
): Ancoragem | null {
  let melhor: Ancoragem | null = null

  for (const candidato of candidatos) {
    candidato.arestas.forEach((aresta, indiceAresta) => {
      const projecao = projetarNaAresta(ponto, aresta)
      if (projecao.distancia > alcance) return
      if (melhor && projecao.distancia >= melhor.distancia) return
      melhor = {
        hospedeiroId: candidato.id,
        indiceAresta,
        t: projecao.t,
        ponto: projecao.ponto,
        angulo: anguloDaAresta(aresta),
        distancia: projecao.distancia,
      }
    })
  }

  return melhor
}

/**
 * Reposiciona uma porta já ancorada depois que a parede mudou.
 *
 * É o que faz o vínculo valer a pena: mover o cômodo, redimensionar de 6×4 para 9×4 ou
 * arrastar um vértice do polígono reprojeta a porta pelo MESMO `t`, no mesmo lado. Sem isto
 * o vínculo seria só um encaixe bonito no instante da criação.
 *
 * Aresta que deixou de existir (o mestre removeu o vértice em que a porta estava) devolve
 * `null` — quem chama decide, e a decisão do app é desancorar com aviso, nunca sumir com a
 * peça. É exatamente a armadilha pela qual o editor de referência é criticado: lá, editar a
 * parede APAGA as portas instaladas nela.
 */
export function reprojetarAncora(
  arestas: Aresta[],
  indiceAresta: number,
  t: number,
): { ponto: Ponto; angulo: number } | null {
  const aresta = arestas[indiceAresta]
  if (!aresta) return null
  const limitado = Math.min(1, Math.max(0, t))
  return {
    ponto: {
      x: aresta.a.x + limitado * (aresta.b.x - aresta.a.x),
      y: aresta.a.y + limitado * (aresta.b.y - aresta.a.y),
    },
    angulo: anguloDaAresta(aresta),
  }
}

/**
 * Trechos de uma aresta que sobram depois de descontar os vãos das portas ancoradas nela.
 *
 * É o que transforma "porta pousada em cima do contorno" em "porta que ABRE passagem": o
 * contorno do cômodo deixa de ser desenhado onde há porta. Sem isto a planta afirma parede
 * contínua exatamente onde existe uma saída, e é isso que o juiz de legibilidade cobra.
 *
 * Recebe e devolve em fração do comprimento (0..1) para não depender da escala: quem desenha
 * converte de volta em coordenada.
 *
 * Vãos que se sobrepõem são fundidos, e vão que cobre a aresta inteira devolve lista vazia —
 * aresta sem traço nenhum, que é o certo quando a porta é do tamanho da parede.
 */
export function trechosSemVao(
  vaos: Array<{ inicio: number; fim: number }>,
): Array<{ inicio: number; fim: number }> {
  const fundidos = fundirIntervalos(vaos)
  if (fundidos.length === 0) return [{ inicio: 0, fim: 1 }]

  const trechos: Array<{ inicio: number; fim: number }> = []
  let cursor = 0
  for (const vao of fundidos) {
    if (vao.inicio > cursor) trechos.push({ inicio: cursor, fim: vao.inicio })
    cursor = Math.max(cursor, vao.fim)
  }
  if (cursor < 1) trechos.push({ inicio: cursor, fim: 1 })
  return trechos
}

/**
 * Normaliza uma lista de intervalos 0..1: limita à faixa, descarta os vazios, ordena e FUNDE
 * os que se tocam.
 *
 * Fundir antes de qualquer conta é o que impede duas fontes de vão de contarem o mesmo pedaço
 * duas vezes — a porta e a parede vizinha frequentemente cobrem o mesmo trecho, e sem a fusão
 * a soma dá o dobro e o recorte deixa um traço de comprimento negativo entre eles.
 */
export function fundirIntervalos(
  intervalos: Array<{ inicio: number; fim: number }>,
): Array<{ inicio: number; fim: number }> {
  const limpos = intervalos
    .map((v) => ({
      inicio: Math.max(0, Math.min(v.inicio, v.fim)),
      fim: Math.min(1, Math.max(v.inicio, v.fim)),
    }))
    .filter((v) => v.fim > v.inicio)
    .sort((x, y) => x.inicio - y.inicio)

  if (limpos.length === 0) return []

  const fundidos: Array<{ inicio: number; fim: number }> = [limpos[0]]
  for (const v of limpos.slice(1)) {
    const ultimo = fundidos[fundidos.length - 1]
    if (v.inicio <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, v.fim)
    else fundidos.push({ ...v })
  }
  return fundidos
}

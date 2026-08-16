// Sem @types/node neste projeto (frontend puro) — mesmo padrão de supressão que
// vite.config.ts já usa para `process`. Os módulos existem em tempo de execução (vitest
// roda em Node); só falta a declaração de tipo.
// @ts-expect-error node builtin sem @types/node
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
// @ts-expect-error node builtin sem @types/node
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'
import { desenharCorpoSala } from '../lib/desenhoSala'
import { desenharCorpoSalaPoligono } from '../lib/desenhoSalaPoligono'
import { desenharCorredor } from '../lib/desenhoCorredor'
import { desenharPorta } from '../lib/desenhoPorta'
import { desenharLinha } from '../lib/desenhoLinha'
import { desenharSimbolo, COR_PINO_ITEM_GENERICO, desenharGlifoItemGenerico, desenharPinoItem } from '../lib/desenhoSimbolo'
import { aparenciaDaSala, ESTADOS_SALA } from '../lib/salaMapa'
import { PONTOS_SALA_POLIGONO_PADRAO, limitesDoPoligono } from '../lib/salaPoligonoMapa'
import { aparenciaDaPorta, ESTADOS_PORTA, PORTA_ESPESSURA_PADRAO, PORTA_LARGURA_PADRAO } from '../lib/portaMapa'
import { SIMBOLOS_MAPA, PINO_ITEM_ALTURA, PINO_ITEM_LARGURA } from '../lib/simbolosMapa'
import { desenharEscada } from '../lib/desenhoEscada'
import { ESCADA_LARGURA_PADRAO, ESCADA_ALTURA_PADRAO } from '../lib/escadaMapa'
import { desenharMuralha } from '../lib/desenhoMuralha'
import { desenharTorre } from '../lib/desenhoTorre'
import { TORRE_DIAMETRO_PADRAO } from '../lib/torreMapa'

/**
 * Gera `.amostra/mapa.html`: catálogo de peças + um mapa de exemplo, para fotografar com
 * Playwright e julgar contra as referências visuais do usuário.
 *
 * NÃO redesenha as peças "igual ao app" — chama as MESMAS funções puras que
 * `SalaMapaShape.tsx`, `PortaShape.tsx`, `SimboloMapaShape.tsx` e `LinhaMapaShape.tsx`
 * usam dentro do tldraw (`desenharCorpoSala`, `desenharPorta`, `desenharSimbolo`,
 * `desenharLinha`). Uma fonte só de verdade — ver o cabeçalho de cada `lib/desenho*.tsx`.
 *
 * Regenerar: `npx vitest run src/test/amostraMapa.test.ts`
 */

// @ts-expect-error __dirname é global do Node (CJS), sem @types/node para tipar
const SAIDA = resolve(__dirname, '../../.amostra/mapa.html')

/** Envolve o miolo puro (rect/text/path…) num `<svg>` de página, do jeito que o
 * `SVGContainer` do tldraw faz — mas sem tldraw, para a amostra não precisar do editor. */
function svgDaPeca(w: number, h: number, miolo: ReactNode, viewBox?: string) {
  return renderToStaticMarkup(
    createElement(
      'svg',
      { width: w, height: h, viewBox: viewBox ?? `0 0 ${w} ${h}`, xmlns: 'http://www.w3.org/2000/svg' },
      miolo,
    ),
  )
}

/** Uma peça do catálogo: rótulo embaixo + o SVG dela. */
function cartao(rotulo: string, svg: string) {
  return `<figure class="peca"><div class="peca-svg">${svg}</div><figcaption>${rotulo}</figcaption></figure>`
}

function gerarCatalogo(): string {
  const cartoes: string[] = []

  // Sala nos 3 estados, sem vínculo — o vínculo é resolvido fora da lib pura (depende do
  // store), então a amostra usa 'sem-vinculo', o caso comum.
  for (const estado of ESTADOS_SALA) {
    const w = 160
    const h = 112
    const svg = svgDaPeca(
      w,
      h,
      desenharCorpoSala({ w, h, estado, rotulo: 'Sala do Depósito Seguro', cor: '', vinculo: { estado: 'sem-vinculo', nomeCenario: null } }),
    )
    cartoes.push(cartao(`Sala — ${aparenciaDaSala(estado).rotulo}`, svg))
  }

  // Sala vinculada e sala com vínculo quebrado, para o badge aparecer no catálogo também.
  cartoes.push(
    cartao(
      'Sala — vinculada a um Cenário',
      svgDaPeca(
        160,
        112,
        desenharCorpoSala({
          w: 160,
          h: 112,
          estado: 'pendente',
          rotulo: 'Câmara do Trono',
          cor: '',
          vinculo: { estado: 'vinculado', nomeCenario: 'Câmara do Trono' },
        }),
      ),
    ),
  )
  cartoes.push(
    cartao(
      'Sala — vínculo quebrado',
      svgDaPeca(
        160,
        112,
        desenharCorpoSala({
          w: 160,
          h: 112,
          estado: 'limpa',
          rotulo: 'Biblioteca',
          cor: '',
          vinculo: { estado: 'quebrado', nomeCenario: null },
        }),
      ),
    ),
  )

  // Sala em polígono (cômodo em L, peça única) — mesmos vértices de nascença que
  // `criarSalaPoligono` usa no app.
  {
    const { w, h } = limitesDoPoligono(PONTOS_SALA_POLIGONO_PADRAO)
    const svg = svgDaPeca(
      w,
      h,
      desenharCorpoSalaPoligono({ pontos: PONTOS_SALA_POLIGONO_PADRAO, estado: 'pendente', rotulo: 'Cripta', cor: '' }),
    )
    cartoes.push(cartao('Sala — Polígono (L)', svg))
  }

  // Corredor — sem estado nem rótulo, ver lib/corredorMapa.ts.
  cartoes.push(cartao('Corredor', svgDaPeca(140, 40, desenharCorredor({ w: 140, h: 40 }))))

  // Escada — shape próprio desta leva (era grupo de retângulos nativos, ver lib/escadaMapa.ts).
  cartoes.push(
    cartao(
      'Escada',
      svgDaPeca(ESCADA_LARGURA_PADRAO, ESCADA_ALTURA_PADRAO, desenharEscada({ w: ESCADA_LARGURA_PADRAO, h: ESCADA_ALTURA_PADRAO })),
    ),
  )

  // Muralha — só o contorno (fill "none"), ver lib/muralhaMapa.ts. Tamanho reduzido no
  // catálogo (o padrão de nascença é grande demais para um cartão) só para caber ao lado
  // das outras peças; a espessura do traço é a mesma constante usada no mapa de exemplo.
  cartoes.push(cartao('Muralha', svgDaPeca(160, 112, desenharMuralha({ w: 160, h: 112 }))))

  // Torre — círculo que marca um canto da muralha, ver lib/torreMapa.ts.
  cartoes.push(
    cartao('Torre', svgDaPeca(TORRE_DIAMETRO_PADRAO, TORRE_DIAMETRO_PADRAO, desenharTorre({ w: TORRE_DIAMETRO_PADRAO, h: TORRE_DIAMETRO_PADRAO }))),
  )

  // Porta nos 3 estados — mesmo tamanho de nascença que `criarPorta` usa no app.
  for (const estado of ESTADOS_PORTA) {
    const w = PORTA_LARGURA_PADRAO
    const h = PORTA_ESPESSURA_PADRAO
    const svg = svgDaPeca(w, h, desenharPorta({ w, h, estado }))
    cartoes.push(cartao(`Porta — ${aparenciaDaPorta(estado).rotulo}`, svg))
  }

  // Cada símbolo do catálogo (construção + itens).
  for (const def of SIMBOLOS_MAPA) {
    const rotulo = def.numerado ? '1' : def.textoLivre ? '1F' : ''
    const svg = svgDaPeca(def.largura, def.altura, desenharSimbolo(def.id, def.largura, def.altura, rotulo))
    cartoes.push(cartao(def.rotulo, svg))
  }

  // Divisória (legado, mas ainda desenhável).
  cartoes.push(cartao('Divisória', svgDaPeca(128, 4, desenharLinha({ dx: 128, dy: 0 }), '0 -4 128 8')))

  // Item de VERDADE (ficha do cofre) solto no mapa — `ItemMapaShape.tsx`. Mesma família de
  // pino dos itens decorativos acima (mesmo tamanho, mesmo desenho de gota), cor e glifo
  // próprios porque não pertence a nenhuma categoria de catálogo. Ao lado dos itens
  // decorativos de propósito: é o que o coordenador pediu para julgar lado a lado.
  cartoes.push(
    cartao(
      'Item real (pino genérico)',
      svgDaPeca(
        PINO_ITEM_LARGURA,
        PINO_ITEM_ALTURA,
        desenharPinoItem(PINO_ITEM_LARGURA, PINO_ITEM_ALTURA, COR_PINO_ITEM_GENERICO, desenharGlifoItemGenerico(PINO_ITEM_LARGURA)),
      ),
    ),
  )

  return cartoes.join('\n')
}

/**
 * Mapa de exemplo: uma planta pequena e plausível de castelo, para julgar o CONJUNTO —
 * mesma técnica do catálogo, funções puras compostas numa grade de salas.
 *
 * Layout desenhado para ser MASSA CONTÍNUA, não uma grade de caixas soltas (era a queixa
 * da revisão cega): três fileiras de salas empilhadas com a MESMA largura total (20 a
 * 520px), cada uma encostando na de baixo sem folga — a parede compartilhada é só a borda
 * onde duas salas se tocam, sem vinco duplo nem preto passando (`desenharCorpoSala`
 * desenha um `<rect>` com stroke CENTRADO na própria borda; duas salas com bordas
 * coincidentes desenham o MESMO traço de 2px na mesma posição, não dois traços somados).
 * Um corredor liga essa massa principal a uma torre separada (mostra a peça no papel de
 * "caminho entre duas construções", como nas referências), e uma sala em polígono (L)
 * fecha o andar embaixo da Masmorra — cômodo irregular como peça única, sem emenda de
 * retângulos.
 *
 * Segunda revisão (muralha/torre/escada/rótulo): muralha cercando o conjunto inteiro com
 * uma torre redonda sobreposta a cada canto (como em `4.png`); uma escada de verdade
 * (hachura, não grade de retângulos) dentro de um corredor que desce da Torre de Vigia;
 * a Guarita virou sala em polígono com o canto externo chanfrado, para mostrar a peça
 * também nesse papel (não só em cômodo irregular tipo L).
 */
function gerarMapaExemplo(): string {
  const partes: string[] = []

  interface SalaDef {
    x: number
    y: number
    w: number
    h: number
    estado: string
    rotulo: string
  }

  // Três fileiras, todas de x=20 a x=520 (largura 500) — por isso encostam sem gerar preto
  // entre elas, mesmo as três tendo divisões internas diferentes.
  const salas: SalaDef[] = [
    // fileira 1 — y:20-132. Guarita saiu daqui: agora é sala em polígono (canto chanfrado,
    // ver bloco abaixo), no mesmo lugar (x:20,y:20,w:140,h:112).
    { x: 160, y: 20, w: 200, h: 112, estado: 'sem-info', rotulo: 'Salão de Entrada' },
    { x: 360, y: 20, w: 160, h: 112, estado: 'limpa', rotulo: 'Sala de Armas' },
    // fileira 2 — y:132-228, encosta direto na fileira 1 (sem corredor: mostra o caso
    // "duas salas dividindo a mesma parede" sem peça nenhuma no meio)
    { x: 20, y: 132, w: 120, h: 96, estado: 'limpa', rotulo: 'Despensa' },
    { x: 140, y: 132, w: 160, h: 96, estado: 'pendente', rotulo: 'Cozinha' },
    { x: 300, y: 132, w: 120, h: 96, estado: 'sem-info', rotulo: 'Adega' },
    { x: 420, y: 132, w: 100, h: 96, estado: 'pendente', rotulo: 'Depósito Seguro' },
    // fileira 3 — y:228-348, encosta direto na fileira 2
    { x: 20, y: 228, w: 200, h: 120, estado: 'sem-info', rotulo: 'Câmara do Trono' },
    { x: 220, y: 228, w: 160, h: 120, estado: 'limpa', rotulo: 'Biblioteca' },
    { x: 380, y: 228, w: 140, h: 120, estado: 'pendente', rotulo: 'Masmorra' },
    // torre separada, ligada à massa principal só pelo corredor abaixo
    { x: 560, y: 60, w: 120, h: 112, estado: 'sem-info', rotulo: 'Torre de Vigia' },
  ]

  const vinculoNenhum = { estado: 'sem-vinculo' as const, nomeCenario: null }

  for (const sala of salas) {
    const svg = svgDaPeca(sala.w, sala.h, desenharCorpoSala({ ...sala, cor: '', vinculo: vinculoNenhum }))
    partes.push(
      `<div class="mapa-peca" style="left:${sala.x}px;top:${sala.y}px;width:${sala.w}px;height:${sala.h}px;">${svg}</div>`,
    )
  }

  // Corredor: liga a Sala de Armas (borda direita x=520) à Torre de Vigia (borda esquerda
  // x=560) — a faixa y:80-120 cai dentro da altura das duas, então toca as duas bordas de
  // verdade, não flutua no ar.
  const corredor = { x: 520, y: 80, w: 40, h: 40 }
  partes.push(
    `<div class="mapa-peca" style="left:${corredor.x}px;top:${corredor.y}px;width:${corredor.w}px;height:${corredor.h}px;">${svgDaPeca(corredor.w, corredor.h, desenharCorredor(corredor))}</div>`,
  )

  // Sala em polígono (L): encosta na borda debaixo da Masmorra (x:380-520,y=348), mesma
  // largura da Masmorra — uma peça só, sem emenda de retângulos.
  const cripta = {
    x: 380,
    y: 348,
    pontos: [
      { x: 0, y: 0 },
      { x: 140, y: 0 },
      { x: 140, y: 80 },
      { x: 70, y: 80 },
      { x: 70, y: 140 },
      { x: 0, y: 140 },
    ],
  }
  const { w: criptaW, h: criptaH } = limitesDoPoligono(cripta.pontos)
  partes.push(
    `<div class="mapa-peca" style="left:${cripta.x}px;top:${cripta.y}px;width:${criptaW}px;height:${criptaH}px;">${svgDaPeca(
      criptaW,
      criptaH,
      desenharCorpoSalaPoligono({ pontos: cripta.pontos, estado: 'pendente', rotulo: 'Cripta', cor: '' }),
    )}</div>`,
  )

  // Guarita: sala em polígono com o canto externo (superior-esquerdo, encostado na
  // muralha/torre) chanfrado — mesma caixa delimitadora (20,20,140×112) que ela ocupava
  // como retângulo, só o vértice cortado muda. Mostra a sala em polígono também nesse
  // papel (chanfro), não só no cômodo em L que a Cripta já ilustra.
  const guarita = {
    x: 20,
    y: 20,
    pontos: [
      { x: 30, y: 0 },
      { x: 140, y: 0 },
      { x: 140, y: 112 },
      { x: 0, y: 112 },
      { x: 0, y: 30 },
    ],
  }
  const { w: guaritaW, h: guaritaH } = limitesDoPoligono(guarita.pontos)
  partes.push(
    `<div class="mapa-peca" style="left:${guarita.x}px;top:${guarita.y}px;width:${guaritaW}px;height:${guaritaH}px;">${svgDaPeca(
      guaritaW,
      guaritaH,
      desenharCorpoSalaPoligono({ pontos: guarita.pontos, estado: 'pendente', rotulo: 'Guarita', cor: '' }),
    )}</div>`,
  )

  // Portas nas paredes que dividem as salas (algumas horizontais, algumas verticais).
  interface PortaDef {
    x: number
    y: number
    w: number
    h: number
    estado: string
  }
  // Tamanho igual ao de nascença (`PORTA_LARGURA_PADRAO`/`PORTA_ESPESSURA_PADRAO`),
  // centradas nas paredes internas da planta nova.
  const portas: PortaDef[] = [
    // fileira 1: entre Guarita/Salão e Salão/Sala de Armas
    { x: 158, y: 66, w: PORTA_ESPESSURA_PADRAO, h: PORTA_LARGURA_PADRAO, estado: 'livre' },
    { x: 358, y: 66, w: PORTA_ESPESSURA_PADRAO, h: PORTA_LARGURA_PADRAO, estado: 'trancada' },
    // entre fileira 1 e fileira 2 (parede horizontal em y=132)
    { x: 210, y: 130, w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, estado: 'atencao' },
    { x: 450, y: 130, w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, estado: 'livre' },
    // fileira 2: entre Cozinha/Adega e Adega/Depósito
    { x: 298, y: 170, w: PORTA_ESPESSURA_PADRAO, h: PORTA_LARGURA_PADRAO, estado: 'livre' },
    { x: 418, y: 170, w: PORTA_ESPESSURA_PADRAO, h: PORTA_LARGURA_PADRAO, estado: 'trancada' },
    // entre fileira 2 e fileira 3 (parede horizontal em y=228)
    { x: 100, y: 226, w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, estado: 'livre' },
    { x: 350, y: 226, w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, estado: 'livre' },
    // fileira 3: entre Câmara/Biblioteca e Biblioteca/Masmorra
    { x: 218, y: 278, w: PORTA_ESPESSURA_PADRAO, h: PORTA_LARGURA_PADRAO, estado: 'livre' },
    { x: 378, y: 278, w: PORTA_ESPESSURA_PADRAO, h: PORTA_LARGURA_PADRAO, estado: 'trancada' },
    // entre Masmorra e a Cripta (parede horizontal em y=348)
    { x: 440, y: 346, w: PORTA_LARGURA_PADRAO, h: PORTA_ESPESSURA_PADRAO, estado: 'atencao' },
  ]
  for (const porta of portas) {
    const svg = svgDaPeca(porta.w, porta.h, desenharPorta(porta))
    partes.push(
      `<div class="mapa-peca" style="left:${porta.x}px;top:${porta.y}px;width:${porta.w}px;height:${porta.h}px;">${svg}</div>`,
    )
  }

  // Símbolos: janela na fachada, marcadores numerados, itens largados, rótulo de andar.
  const simbolosNoMapa: Array<{ x: number; y: number; id: string; rotulo?: string }> = [
    { x: 70, y: 14, id: 'janela' },
    { x: 250, y: 14, id: 'janela' },
    { x: 420, y: 14, id: 'janela' },
    { x: 110, y: 88, id: 'marcador', rotulo: '1' },
    { x: 470, y: 185, id: 'bau' },
    { x: 35, y: 312, id: 'secreta' },
    { x: 335, y: 312, id: 'livro' },
    { x: 480, y: 312, id: 'chave' },
    { x: 420, y: 400, id: 'pocao' },
    { x: 20, y: 500, id: 'andar', rotulo: '1F' },
  ]
  for (const s of simbolosNoMapa) {
    const def = SIMBOLOS_MAPA.find((d) => d.id === s.id)
    const w = def?.largura ?? 40
    const h = def?.altura ?? 40
    const svg = svgDaPeca(w, h, desenharSimbolo(s.id, w, h, s.rotulo ?? ''))
    partes.push(`<div class="mapa-peca" style="left:${s.x}px;top:${s.y}px;width:${w}px;height:${h}px;">${svg}</div>`)
  }

  // Item de VERDADE solto no mapa (`ItemMapaShape.tsx`) — pino genérico na Sala de Armas,
  // pra julgar ao lado dos itens decorativos acima: mesma família, cor própria.
  partes.push(
    `<div class="mapa-peca" style="left:480px;top:40px;width:${PINO_ITEM_LARGURA}px;height:${PINO_ITEM_ALTURA}px;">${svgDaPeca(
      PINO_ITEM_LARGURA,
      PINO_ITEM_ALTURA,
      desenharPinoItem(PINO_ITEM_LARGURA, PINO_ITEM_ALTURA, COR_PINO_ITEM_GENERICO, desenharGlifoItemGenerico(PINO_ITEM_LARGURA)),
    )}</div>`,
  )

  // Uma divisória interna na Câmara do Trono, para o catálogo mostrar a peça no contexto.
  partes.push(
    `<svg class="mapa-peca" style="left:120px;top:228px;width:2px;height:120px;" width="2" height="120" viewBox="-4 0 8 120">${renderToStaticMarkup(createElement('g', null, desenharLinha({ dx: 0, dy: 120 })))}</svg>`,
  )

  // Corredor descendo da Torre de Vigia (borda debaixo, x:560-680,y=172), com uma escada
  // DE VERDADE (hachura, shape próprio) ocupando o miolo dele — como nas referências, um
  // trecho de degraus dentro de um corredor mais largo, não a faixa inteira.
  const corredorEscada = { x: 600, y: 172, w: 40, h: 140 }
  partes.push(
    `<div class="mapa-peca" style="left:${corredorEscada.x}px;top:${corredorEscada.y}px;width:${corredorEscada.w}px;height:${corredorEscada.h}px;">${svgDaPeca(corredorEscada.w, corredorEscada.h, desenharCorredor(corredorEscada))}</div>`,
  )
  const escadaNoCorredor = { x: 608, y: 190, w: 24, h: 100 }
  partes.push(
    `<div class="mapa-peca" style="left:${escadaNoCorredor.x}px;top:${escadaNoCorredor.y}px;width:${escadaNoCorredor.w}px;height:${escadaNoCorredor.h}px;">${svgDaPeca(escadaNoCorredor.w, escadaNoCorredor.h, desenharEscada(escadaNoCorredor))}</div>`,
  )

  /**
   * Muralha + torres cercando o CONTEÚDO de verdade — não um número fixo de pixels
   * chutado. `CONTEUDO_*` é a caixa delimitadora real de tudo que foi empurrado em
   * `partes` acima (rooms de x:20 a x:680, janela no topo em y:14, rótulo de andar
   * terminando em y:544 — conferido à mão contra cada bloco desta função).
   *
   * Fix de revisão: a versão anterior desenhava a muralha a 2px da borda do CONTAINER,
   * não do conteúdo — a torre (raio 45) furava tanto o container quanto a legenda de
   * texto ACIMA dele (coordenada Y negativa "vazava" para cima na página). Aqui o
   * container nasce do conteúdo: `PADDING_CONTAINER` garante que a torre INTEIRA (não
   * só o centro) caiba com folga visível antes da borda do quadro, e o conteúdo entra
   * num wrapper deslocado (`.mapa-conteudo`) para não precisar reescrever a coordenada
   * de cada peça já empurrada acima.
   */
  const CONTEUDO_MIN_X = 20
  const CONTEUDO_MAX_X = 680
  const CONTEUDO_MIN_Y = 14
  const CONTEUDO_MAX_Y = 544
  const MARGEM_MURALHA = 24 // vão entre a última peça e o traço da muralha
  const PADDING_CONTAINER = TORRE_DIAMETRO_PADRAO / 2 + 20 // torre inteira + folga visível

  const larguraConteudo = CONTEUDO_MAX_X - CONTEUDO_MIN_X
  const alturaConteudo = CONTEUDO_MAX_Y - CONTEUDO_MIN_Y
  const muralha = {
    x: PADDING_CONTAINER,
    y: PADDING_CONTAINER,
    w: larguraConteudo + MARGEM_MURALHA * 2,
    h: alturaConteudo + MARGEM_MURALHA * 2,
  }
  const larguraContainer = muralha.x * 2 + muralha.w
  const alturaContainer = muralha.y * 2 + muralha.h
  // desloca o conteúdo (coordenadas já escritas acima, sem reescrever nenhuma) para
  // dentro do vão que a muralha abre.
  const deslocamentoX = muralha.x + MARGEM_MURALHA - CONTEUDO_MIN_X
  const deslocamentoY = muralha.y + MARGEM_MURALHA - CONTEUDO_MIN_Y

  const conteudo = `<div class="mapa-conteudo" style="left:${deslocamentoX}px;top:${deslocamentoY}px;">${partes.join('\n')}</div>`

  const muros: string[] = []
  muros.push(
    `<div class="mapa-peca" style="left:${muralha.x}px;top:${muralha.y}px;width:${muralha.w}px;height:${muralha.h}px;">${svgDaPeca(muralha.w, muralha.h, desenharMuralha(muralha))}</div>`,
  )
  const meiaTorre = TORRE_DIAMETRO_PADRAO / 2
  const cantosMuralha = [
    { x: muralha.x, y: muralha.y },
    { x: muralha.x + muralha.w, y: muralha.y },
    { x: muralha.x, y: muralha.y + muralha.h },
    { x: muralha.x + muralha.w, y: muralha.y + muralha.h },
  ]
  for (const canto of cantosMuralha) {
    const x = canto.x - meiaTorre
    const y = canto.y - meiaTorre
    muros.push(
      `<div class="mapa-peca" style="left:${x}px;top:${y}px;width:${TORRE_DIAMETRO_PADRAO}px;height:${TORRE_DIAMETRO_PADRAO}px;">${svgDaPeca(TORRE_DIAMETRO_PADRAO, TORRE_DIAMETRO_PADRAO, desenharTorre({ w: TORRE_DIAMETRO_PADRAO, h: TORRE_DIAMETRO_PADRAO }))}</div>`,
    )
  }

  return `<div class="mapa-exemplo" style="width:${larguraContainer}px;height:${alturaContainer}px;">${muros.join('\n')}\n${conteudo}</div>`
}

function gerarHtml(): string {
  const catalogo = gerarCatalogo()
  const mapa = gerarMapaExemplo()

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Amostra do Mapa — Grimório</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #000000;
    color: #e8e8e8;
    font-family: system-ui, sans-serif;
    padding: 24px;
    width: 1280px;
  }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  h2 { font-size: 14px; font-weight: 600; color: #9fa8b2; margin: 32px 0 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  p.legenda { font-size: 12px; color: #888; margin: 0 0 16px; }
  .catalogo {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .peca {
    margin: 0;
    background: #141414;
    border: 1px solid #2a2a2a;
    border-radius: 4px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 90px;
  }
  .peca-svg { display: flex; align-items: center; justify-content: center; min-height: 60px; }
  .peca svg { display: block; }
  .peca figcaption { font-size: 11px; color: #aaa; margin-top: 8px; text-align: center; }
  .mapa-exemplo {
    position: relative;
    background: #000000;
    border: 1px solid #2a2a2a;
    /* width/height vêm inline (calculados a partir do conteúdo real, ver gerarMapaExemplo) */
  }
  /* wrapper que carrega TODAS as peças de dentro da muralha (rooms, portas, símbolos,
     corredor+escada) deslocado para dentro do vão que a muralha abre — as coordenadas de
     cada peça continuam as mesmas escritas em gerarMapaExemplo, só a origem se move. */
  .mapa-conteudo { position: absolute; }
  .mapa-peca { position: absolute; }
  .mapa-peca svg { display: block; overflow: visible; }
</style>
</head>
<body>
  <h1>Amostra do Mapa — Grimório</h1>
  <p class="legenda">Gerado por src/test/amostraMapa.test.ts a partir das funções puras de src/lib/desenho*.tsx — a mesma fonte que o app usa dentro do tldraw.</p>

  <h2>Catálogo de peças</h2>
  <div class="catalogo">
${catalogo}
  </div>

  <h2>Mapa de exemplo</h2>
  <p class="legenda">Planta de castelo — salas encostadas de tamanhos variados, muralha cercando o conjunto com torre em cada canto, escada de verdade dentro de um corredor, sala em polígono em dois papéis (L da Cripta, canto chanfrado da Guarita) — para julgar o conjunto como massa contínua.</p>
${mapa}
</body>
</html>
`
}

describe('amostra visual do mapa', () => {
  it('gera .amostra/mapa.html a partir das MESMAS funções puras que os shapes usam', () => {
    const html = gerarHtml()

    mkdirSync(dirname(SAIDA), { recursive: true })
    writeFileSync(SAIDA, html, 'utf-8')

    expect(existsSync(SAIDA)).toBe(true)

    const gravado = readFileSync(SAIDA, 'utf-8')

    // Confere que a cor gravada é a MESMA que `aparenciaDaSala` devolve — se a amostra
    // um dia descolar da lib pura (alguém troca uma cor só na função de desenho local),
    // este teste quebra em vez de a divergência passar batida.
    const corPendente = aparenciaDaSala('pendente').preenchimento
    expect(gravado).toContain(`fill="${corPendente}"`)
    const corLimpa = aparenciaDaSala('limpa').preenchimento
    expect(gravado).toContain(`fill="${corLimpa}"`)

    const corPortaTrancada = aparenciaDaPorta('trancada').cor
    expect(gravado).toContain(`fill="${corPortaTrancada}"`)

    // Contorno da sala é a MESMA cor que a divisória (ver CONTORNO_SALA) — a amostra
    // precisa mostrar as duas peças indistinguíveis, como no app.
    const contornoSala = aparenciaDaSala('pendente').contorno
    expect(gravado).toContain(`stroke="${contornoSala}"`)

    // Todos os rótulos do catálogo de símbolos aparecem na página.
    for (const def of SIMBOLOS_MAPA) {
      expect(gravado).toContain(`>${def.rotulo}<`)
    }

    // Autossuficiente: sem CDN, sem fonte/script externo. `xmlns="http://www.w3.org/2000/svg"`
    // é o namespace padrão do SVG (não busca nada na rede), por isso fica de fora do check.
    expect(gravado).not.toContain('<script')
    expect(gravado).not.toContain('<link')
    expect(gravado).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
  })
})

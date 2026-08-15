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
import { DEGRAUS_ESCADA } from '../lib/paletaMapa'

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
 * Escada: grupo de retângulos nativos do tldraw (`geo`, `color: black`, `fill: solid`) —
 * ver `criarEscada` em `MapaToolbar.tsx`. Não é uma das quatro peças com função pura
 * pedida nesta extração (não passa por `SVGContainer` nem por um `ShapeUtil` nosso; é
 * geometria nativa do tldraw), então a amostra aproxima o visual sem chamar biblioteca
 * nenhuma — ela NÃO é fonte de verdade para a escada, só ilustra a planta de exemplo.
 */
function desenharEscadaAproximada(x: number, y: number): string {
  const largura = 50
  const altura = 6
  const espaco = 6
  const degraus = Array.from(
    { length: DEGRAUS_ESCADA },
    (_, i) => `<rect x="${x}" y="${y + i * (altura + espaco)}" width="${largura}" height="${altura}" fill="#111111" stroke="#000000" />`,
  ).join('')
  return degraus
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
    // fileira 1 — y:20-132
    { x: 20, y: 20, w: 140, h: 112, estado: 'pendente', rotulo: 'Guarita' },
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

  // Escada dentro da Torre de Vigia, na metade debaixo do rótulo (aproximação — ver
  // comentário acima).
  partes.push(
    `<svg class="mapa-peca" style="left:595px;top:118px;width:50px;height:54px;" width="50" height="54" viewBox="0 0 50 54">${desenharEscadaAproximada(0, 0)}</svg>`,
  )

  // Uma divisória interna na Câmara do Trono, para o catálogo mostrar a peça no contexto.
  partes.push(
    `<svg class="mapa-peca" style="left:120px;top:228px;width:2px;height:120px;" width="2" height="120" viewBox="-4 0 8 120">${renderToStaticMarkup(createElement('g', null, desenharLinha({ dx: 0, dy: 120 })))}</svg>`,
  )

  return `<div class="mapa-exemplo">${partes.join('\n')}</div>`
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
    width: 720px;
    height: 560px;
    background: #000000;
    border: 1px solid #2a2a2a;
  }
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
  <p class="legenda">Planta de castelo — salas encostadas, corredor ligando à torre, uma sala em polígono (Cripta) — para julgar o conjunto como massa contínua.</p>
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

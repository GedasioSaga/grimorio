/**
 * Miolo do desenho dos símbolos do mapa, extraído de `SimboloMapaShape.tsx` — mesmo
 * padrão de `desenhoSala.tsx`. Já era puro no arquivo original (nenhum hook, nenhum
 * import de tldraw); só mudou de endereço para a página de amostra poder chamar sem
 * arrastar o `ShapeUtil` junto.
 */
import type { ReactNode } from 'react'

/** Paleta fixa dos símbolos — ver o porquê de não usar o StylePanel em simbolosMapa.ts. */
const CORES = {
  fundoEscuro: '#0d0d0d',
  vidro: '#4dabf7',
  segredoFundo: '#2a1b3d',
  segredoTraco: '#c77dff',
  perigo: '#e03131',
  referencia: '#f2c94c',
  madeira: '#6a5a48',
  madeiraTraco: '#a08d72',
} as const

export function desenharSimbolo(simbolo: string, w: number, h: number, rotulo: string) {
  switch (simbolo) {
    /** vão de parede com vidro: moldura + a linha do vidro no meio */
    case 'janela':
      return (
        <>
          <rect x={0} y={0} width={w} height={h} fill={CORES.fundoEscuro} stroke={CORES.vidro} strokeWidth={2} />
          <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={CORES.vidro} strokeWidth={2} />
        </>
      )

    /** parede falsa: bloco escuro com "S" — some no mapa dos jogadores, salta pro mestre */
    case 'secreta':
      return (
        <>
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill={CORES.segredoFundo}
            stroke={CORES.segredoTraco}
            strokeWidth={2}
          />
          <text
            x={w / 2}
            y={h / 2}
            fill={CORES.segredoTraco}
            fontSize={Math.min(w, h) * 0.8}
            fontFamily="Georgia, serif"
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
          >
            S
          </text>
        </>
      )

    /** losango cheio com "!": perigo se lê de relance mesmo com o mapa reduzido */
    case 'armadilha':
      return (
        <>
          <path d={`M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`} fill={CORES.perigo} />
          <text
            x={w / 2}
            y={h / 2}
            fill={CORES.fundoEscuro}
            fontSize={Math.min(w, h) * 0.55}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="central"
          >
            !
          </text>
        </>
      )

    /** círculo cheio com o número: amarra o ponto do mapa à anotação escrita */
    case 'marcador':
      return (
        <>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={CORES.referencia} />
          <text
            x={w / 2}
            y={h / 2}
            fill={CORES.fundoEscuro}
            fontSize={Math.min(w, h) * 0.5}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {rotulo}
          </text>
        </>
      )

    case 'mesa':
      return <rect x={0} y={0} width={w} height={h} rx={2} fill={CORES.madeira} stroke={CORES.madeiraTraco} strokeWidth={1.5} />

    /** cama: bloco + a linha do travesseiro, que é o que a distingue de uma mesa */
    case 'cama':
      return (
        <>
          <rect x={0} y={0} width={w} height={h} rx={2} fill={CORES.madeira} stroke={CORES.madeiraTraco} strokeWidth={1.5} />
          <line x1={0} y1={h * 0.28} x2={w} y2={h * 0.28} stroke={CORES.madeiraTraco} strokeWidth={1.5} />
        </>
      )

    /** baú: bloco + tampa e o risco do fecho */
    case 'bau':
      return (
        <>
          <rect x={0} y={0} width={w} height={h} rx={2} fill={CORES.madeira} stroke={CORES.madeiraTraco} strokeWidth={1.5} />
          <line x1={0} y1={h * 0.35} x2={w} y2={h * 0.35} stroke={CORES.madeiraTraco} strokeWidth={1.5} />
          <rect x={w / 2 - 2} y={h * 0.35} width={4} height={h * 0.25} fill={CORES.madeiraTraco} />
        </>
      )

    /**
     * Rótulo do andar: texto branco grande, sem caixa nem moldura — é assim nas
     * referências. O corpo acompanha a altura da caixa, então o usuário controla o
     * tamanho redimensionando, como faria com qualquer forma.
     */
    case 'andar':
      return (
        <text
          x={0}
          y={h / 2}
          fill="#ffffff"
          fontSize={h * 0.82}
          fontWeight={800}
          fontFamily="Georgia, 'Times New Roman', serif"
          dominantBaseline="central"
        >
          {rotulo || '1F'}
        </text>
      )

    default:
      return desenharItem(simbolo, w, h)
  }
}

/**
 * Itens largados pelo mapa: FAMÍLIA de pinos, não dez ilustrações independentes.
 *
 * Antes cada item tinha silhueta própria (frasco, folha, chave, moeda…) — em zoom
 * afastado, dez desenhos diferentes viram ruído, e um deles ("comida": concha grande
 * ocupando o quadrado inteiro) foi a queixa direta do usuário: "os itens são feios...
 * se é para ser desse nível melhor trocar a tecnologia". Nas referências (mapas de RE2,
 * `14.png`), item no mapa não é um objeto desenhado — é um PINO uniforme (gota) com um
 * glifo branco simples dentro, colorido por CATEGORIA. Pequeno, mesma silhueta, legível
 * a qualquer zoom: dez pinos iguais com glifos distintos formam um sistema, não uma
 * galeria de desenhos.
 *
 * A cor do pino carrega o tipo antes mesmo do glifo ser lido — mesma ideia da sala
 * (cor = estado) e da porta (cor = pode passar). Categorias fechadas de propósito,
 * mesmo espírito da paleta fechada de `salaMapa.ts` (`CORES_SALA`): liberdade de cor
 * é o que produzia resultado genérico.
 */
const BRANCO_GLIFO = '#f2efe6'

const CORES_CATEGORIA_ITEM: Record<string, string> = {
  cura: '#3f9142',
  tesouro: '#c9922e',
  conhecimento: '#3a6ea5',
  combate: '#b8452f',
  utilidade: '#6a5a48',
}

const CATEGORIA_DO_ITEM: Record<string, keyof typeof CORES_CATEGORIA_ITEM> = {
  pocao: 'cura',
  erva: 'cura',
  chave: 'tesouro',
  moeda: 'tesouro',
  documento: 'conhecimento',
  livro: 'conhecimento',
  espada: 'combate',
  municao: 'combate',
  tocha: 'utilidade',
  comida: 'utilidade',
}

/**
 * Cor neutra do pino de um Item de VERDADE (ficha do cofre) solto no mapa — ver
 * `ItemMapaShape.tsx`. Fora da paleta de categorias acima de propósito: um Item real
 * pode ser qualquer coisa (não só poção/chave/etc.), então o pino dele não deveria fingir
 * pertencer a uma categoria de catálogo que talvez nem descreva o objeto.
 */
export const COR_PINO_ITEM_GENERICO = '#5a4a78'

/**
 * Corpo do pino: uma gota (círculo + ponta), a mesma silhueta pra qualquer item — só a
 * COR muda (categoria) e o GLIFO no meio muda (o quê). `w` é o diâmetro do círculo; `h`
 * inclui a ponta abaixo dele, por isso os itens nascem mais altos que largos
 * (`PINO_ITEM_LARGURA`/`PINO_ITEM_ALTURA` em `simbolosMapa.ts`).
 *
 * Exportado porque `ItemMapaShape.tsx` (Item de verdade solto no mapa) usa o MESMO
 * desenho — um pino de cor própria (`COR_PINO_ITEM_GENERICO`) com um glifo genérico —
 * para as duas famílias de item lerem como uma coisa só no mapa, não duas convenções
 * concorrentes.
 */
export function desenharPinoItem(w: number, h: number, cor: string, glifo: ReactNode) {
  const bulbR = w / 2
  const tipY = h
  const d = [
    `M ${bulbR} ${tipY}`,
    `C ${bulbR * 0.1} ${tipY - (tipY - bulbR) * 0.55} 0 ${bulbR * 1.35} 0 ${bulbR}`,
    `A ${bulbR} ${bulbR} 0 1 1 ${w} ${bulbR}`,
    `C ${w} ${bulbR * 1.35} ${bulbR * 1.9} ${tipY - (tipY - bulbR) * 0.55} ${bulbR} ${tipY}`,
    'Z',
  ].join(' ')
  return (
    <>
      <path d={d} fill={cor} stroke="#0d0d0d" strokeWidth={1} strokeLinejoin="round" />
      <g transform={`translate(${bulbR} ${bulbR})`}>{glifo}</g>
    </>
  )
}

/** Losango facetado: o glifo genérico de "objeto de valor", sem depender de categoria. */
export function desenharGlifoItemGenerico(w: number): ReactNode {
  const gr = w * 0.34
  return (
    <g fill={BRANCO_GLIFO} stroke="#0d0d0d" strokeWidth={gr * 0.06}>
      <path d={`M 0 ${-gr * 0.62} L ${gr * 0.5} 0 L 0 ${gr * 0.62} L ${-gr * 0.5} 0 Z`} />
      <line x1={0} y1={-gr * 0.62} x2={0} y2={gr * 0.62} stroke={COR_PINO_ITEM_GENERICO} strokeWidth={gr * 0.08} />
    </g>
  )
}

const GLIFOS_ITEM: Record<string, (gr: number) => ReactNode> = {
  /** frasco: neck + corpo trapezoidal, silhueta só (sem cor própria — o pino já colore) */
  pocao: (gr) => (
    <g fill={BRANCO_GLIFO}>
      <rect x={-gr * 0.18} y={-gr * 1.05} width={gr * 0.36} height={gr * 0.35} />
      <path
        d={`M ${-gr * 0.45} ${gr * 0.85} L ${-gr * 0.45} ${-gr * 0.1} L ${-gr * 0.22} ${-gr * 0.5} L ${gr * 0.22} ${-gr * 0.5} L ${gr * 0.45} ${-gr * 0.1} L ${gr * 0.45} ${gr * 0.85} Z`}
      />
    </g>
  ),
  /** three-leaf, a mesma composição de antes — só virou monocromática */
  erva: (gr) => (
    <g fill={BRANCO_GLIFO}>
      <ellipse cx={0} cy={-gr * 0.15} rx={gr * 0.34} ry={gr * 0.48} />
      <ellipse cx={-gr * 0.4} cy={gr * 0.3} rx={gr * 0.28} ry={gr * 0.42} transform={`rotate(-40 ${-gr * 0.4} ${gr * 0.3})`} />
      <ellipse cx={gr * 0.4} cy={gr * 0.3} rx={gr * 0.28} ry={gr * 0.42} transform={`rotate(40 ${gr * 0.4} ${gr * 0.3})`} />
    </g>
  ),
  /** anel + haste: silhueta mínima de chave, legível mesmo minúscula */
  chave: (gr) => (
    <g stroke={BRANCO_GLIFO} strokeWidth={gr * 0.24} strokeLinecap="round" fill="none">
      <circle cx={-gr * 0.32} cy={-gr * 0.32} r={gr * 0.3} />
      <line x1={-gr * 0.08} y1={-gr * 0.08} x2={gr * 0.55} y2={gr * 0.55} />
      <line x1={gr * 0.28} y1={gr * 0.28} x2={gr * 0.48} y2={gr * 0.08} />
    </g>
  ),
  /** folha com duas linhas — o glifo universal de "papel escrito" */
  documento: (gr) => (
    <g>
      <rect x={-gr * 0.4} y={-gr * 0.55} width={gr * 0.8} height={gr * 1.1} fill={BRANCO_GLIFO} />
      <g stroke="#3a3a3a" strokeWidth={gr * 0.1}>
        <line x1={-gr * 0.22} y1={-gr * 0.08} x2={gr * 0.22} y2={-gr * 0.08} />
        <line x1={-gr * 0.22} y1={gr * 0.18} x2={gr * 0.22} y2={gr * 0.18} />
      </g>
    </g>
  ),
  /** anel simples: moeda, sem depender de cor dourada — a categoria já é dourada */
  moeda: (gr) => <circle cx={0} cy={0} r={gr * 0.48} fill="none" stroke={BRANCO_GLIFO} strokeWidth={gr * 0.24} />,
  /** lâmina + guarda + punho: silhueta de espada em três traços */
  espada: (gr) => (
    <g stroke={BRANCO_GLIFO} strokeLinecap="round">
      <line x1={0} y1={-gr * 0.68} x2={0} y2={gr * 0.28} strokeWidth={gr * 0.18} />
      <line x1={-gr * 0.34} y1={gr * 0.02} x2={gr * 0.34} y2={gr * 0.02} strokeWidth={gr * 0.16} />
      <line x1={0} y1={gr * 0.28} x2={0} y2={gr * 0.65} strokeWidth={gr * 0.3} />
    </g>
  ),
  /** flecha diagonal com ponta — munição em linguagem de RPG, não cartucho */
  municao: (gr) => (
    <g stroke={BRANCO_GLIFO} strokeWidth={gr * 0.2} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1={-gr * 0.42} y1={gr * 0.55} x2={gr * 0.42} y2={-gr * 0.55} />
      <path d={`M ${gr * 0.08} ${-gr * 0.55} L ${gr * 0.42} ${-gr * 0.55} L ${gr * 0.42} ${-gr * 0.21}`} />
    </g>
  ),
  /** capa + lombada: livro reduzido a dois traços */
  livro: (gr) => (
    <g>
      <rect x={-gr * 0.42} y={-gr * 0.52} width={gr * 0.84} height={gr * 1.04} rx={gr * 0.06} fill={BRANCO_GLIFO} />
      <line x1={-gr * 0.06} y1={-gr * 0.52} x2={-gr * 0.06} y2={gr * 0.52} stroke="#3a3a3a" strokeWidth={gr * 0.08} />
    </g>
  ),
  /** chama simplificada — reconhecível mesmo pequena por causa da ponta assimétrica */
  tocha: (gr) => (
    <path
      d={`M 0 ${-gr * 0.62} C ${gr * 0.44} ${-gr * 0.3} ${gr * 0.36} ${gr * 0.18} 0 ${gr * 0.4} C ${-gr * 0.36} ${gr * 0.18} ${-gr * 0.44} ${-gr * 0.3} 0 ${-gr * 0.62} Z`}
      fill={BRANCO_GLIFO}
    />
  ),
  /** coxa + osso: comida em silhueta única — era o pior ofensor da versão anterior */
  comida: (gr) => (
    <g fill={BRANCO_GLIFO}>
      <circle cx={-gr * 0.06} cy={-gr * 0.14} r={gr * 0.38} />
      <rect
        x={-gr * 0.13}
        y={gr * 0.04}
        width={gr * 0.26}
        height={gr * 0.52}
        rx={gr * 0.1}
        transform={`rotate(38 ${-gr * 0.13} ${gr * 0.04})`}
      />
    </g>
  ),
}

/**
 * Itens largados pelo mapa: mesmo pino (`desenharPinoItem`), cor por categoria, glifo por
 * item. `w`/`h` seguem vindo de `PINO_ITEM_LARGURA`/`PINO_ITEM_ALTURA` em `simbolosMapa.ts`,
 * mas o desenho usa fração deles — redimensionar continua funcionando.
 */
function desenharItem(simbolo: string, w: number, h: number) {
  const glifo = GLIFOS_ITEM[simbolo]
  if (!glifo) {
    // símbolo desconhecido: retângulo tracejado neutro, para o usuário ver e poder apagar
    return (
      <rect x={0} y={0} width={w} height={h} fill="none" stroke={CORES.madeiraTraco} strokeWidth={1.5} strokeDasharray="4 3" />
    )
  }
  const categoria = CATEGORIA_DO_ITEM[simbolo]
  const cor = categoria ? CORES_CATEGORIA_ITEM[categoria] : CORES.madeiraTraco
  const gr = w * 0.34
  return desenharPinoItem(w, h, cor, glifo(gr))
}

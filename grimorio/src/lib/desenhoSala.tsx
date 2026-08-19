import type { VinculoSala } from './vinculoSalaCenario'
import { arestasDeCaixa, trechosSemVao } from './ancoraPorta'
import { ESPESSURA_CONTORNO_SALA, aparenciaDaSala, layoutDoRotulo, type EstiloRotulo } from './salaMapa'

/**
 * Miolo do desenho da sala, extraído de `SalaMapaShape.tsx` para função pura: sem
 * `SVGContainer`, sem hook do tldraw/zustand. O vínculo com o Cenário já vem RESOLVIDO
 * (`VinculoSala`) porque resolver o vínculo depende do store — isso não é geometria, é
 * contexto de app, então fica de fora desta função.
 *
 * Usada pelo `component()` do shape (que resolve o vínculo e repassa aqui) e pela página
 * de amostra (`.amostra/mapa.html`), para as duas nunca desenharem a sala de dois jeitos.
 */

/** Tamanho do badge de vínculo, no canto superior-direito da sala. */
const BADGE_RAIO = 8
const BADGE_MARGEM = 4

export interface DesenharCorpoSalaProps {
  w: number
  h: number
  estado: string
  rotulo: string
  cor: string
  vinculo: VinculoSala
  /** espessura do contorno em px; ausente cai no padrão de sempre (sala de mapa antigo) */
  espessura?: number
  /** tamanho, posição e orientação do nome do cômodo — ver `layoutDoRotulo` */
  estiloRotulo?: EstiloRotulo
  /**
   * Vãos abertos pelas portas ancoradas, por índice de aresta (0 topo, 1 direita, 2 base,
   * 3 esquerda), cada um em fração do comprimento da aresta. Ver `vaosPorAresta`.
   */
  vaos?: Map<number, Array<{ inicio: number; fim: number }>>
}

export function desenharCorpoSala({
  w,
  h,
  estado,
  rotulo,
  cor,
  vinculo,
  espessura,
  estiloRotulo,
  vaos,
}: DesenharCorpoSalaProps) {
  const aparencia = aparenciaDaSala(estado, cor || undefined)
  // `> 0` e não `??`: a prop chega como 0 se alguma migração/IA escrever lixo, e traço 0
  // é uma sala sem contorno nenhum — indistinguível de "sumiu" num mapa escuro.
  const tracoPx = espessura && espessura > 0 ? espessura : ESPESSURA_CONTORNO_SALA
  // O padrão continua sendo o TOPO (ver MARGEM_TOPO_ROTULO em salaMapa.ts: deixa o miolo
  // livre para o ícone da peça largada dentro da sala). O que mudou é que agora é padrão,
  // não regra — o mestre escolhe posição, corpo e orientação no painel.
  const texto = layoutDoRotulo({ x0: 0, y0: 0, w, h }, rotulo, estiloRotulo ?? {})

  const badgeCx = w - BADGE_MARGEM - BADGE_RAIO
  const badgeCy = BADGE_MARGEM + BADGE_RAIO
  const badgeCabe = w > (BADGE_RAIO + BADGE_MARGEM) * 2 && h > (BADGE_RAIO + BADGE_MARGEM) * 2

  return (
    <>
      {/* Preenchimento e contorno são desenhados SEPARADOS desde que a porta abre vão: o
          preenchimento continua sendo o retângulo inteiro (o chão do cômodo não tem buraco
          onde tem porta), mas o contorno vira uma lista de trechos, interrompida onde há
          passagem. Um `<rect>` com stroke não sabe pular pedaço. */}
      <rect x={0} y={0} width={w} height={h} fill={aparencia.preenchimento} stroke="none" />
      {trechosDeContorno(w, h, vaos).map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={aparencia.contorno}
          strokeWidth={tracoPx}
          strokeLinecap="butt"
        />
      ))}
      <g transform={texto.transform || undefined}>
        {texto.linhas.map((linha, i) => (
          <text
            key={i}
            x={texto.x}
            y={texto.y + i * texto.entrelinha}
            fill={aparencia.texto}
            fontSize={texto.fonte}
            fontFamily="system-ui, sans-serif"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {linha}
          </text>
        ))}
      </g>
      {/* `carregando` fica de fora: a sala tem vínculo, mas o cache de cenários ainda não
          chegou. Desenhar o ⚠ aqui acusaria estrago que não houve, e o aviso vira ruído. Assim
          que `carregarCenarios` termina, o zustand re-renderiza e o 🔗 aparece sozinho. */}
      {(vinculo.estado === 'vinculado' || vinculo.estado === 'quebrado') && badgeCabe && (
        <g>
          <title>
            {vinculo.estado === 'vinculado'
              ? `Abre "${vinculo.nomeCenario}" (duplo clique)`
              : 'Vínculo quebrado: o cenário foi excluído'}
          </title>
          <circle
            cx={badgeCx}
            cy={badgeCy}
            r={BADGE_RAIO}
            fill={vinculo.estado === 'vinculado' ? '#2f6f4f' : '#8a3b2f'}
            stroke={aparencia.contorno}
            strokeWidth={1}
          />
          <text
            x={badgeCx}
            y={badgeCy}
            fontSize={BADGE_RAIO * 1.3}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
          >
            {vinculo.estado === 'vinculado' ? '🔗' : '⚠'}
          </text>
        </g>
      )}
    </>
  )
}

/**
 * O contorno do cômodo como uma lista de traços, com buraco onde há porta ancorada.
 *
 * É o que separa "porta pousada em cima da parede" de "porta que ABRE passagem". Sem isto a
 * planta afirma parede contínua exatamente onde existe uma saída — e é o que o juiz de
 * legibilidade cobra: o jogador pergunta se o quarto tem saída olhando para um desenho que
 * responde que não.
 *
 * Sem vão nenhum, devolve os quatro lados inteiros — mesmo desenho de antes, só expresso em
 * quatro linhas em vez de um `<rect>`.
 */
function trechosDeContorno(
  w: number,
  h: number,
  vaos: Map<number, Array<{ inicio: number; fim: number }>> | undefined,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const saida: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

  arestasDeCaixa(w, h).forEach((aresta, indice) => {
    const dx = aresta.b.x - aresta.a.x
    const dy = aresta.b.y - aresta.a.y
    for (const trecho of trechosSemVao(vaos?.get(indice) ?? [])) {
      saida.push({
        x1: aresta.a.x + dx * trecho.inicio,
        y1: aresta.a.y + dy * trecho.inicio,
        x2: aresta.a.x + dx * trecho.fim,
        y2: aresta.a.y + dy * trecho.fim,
      })
    }
  })

  return saida
}

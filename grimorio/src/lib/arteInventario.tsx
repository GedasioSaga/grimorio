/**
 * Arte pictórica dos slots do inventário (`AcervoCenario.tsx`) — módulo próprio, separado
 * de `desenhoSimbolo.tsx` (código de MAPA, compartilhado com a gaveta de peças e o
 * harness). Ali um item é um PINO pequeno lido a distância no tabuleiro; aqui o slot é
 * grande e parado, então o objetivo é o oposto: cada item ganha uma silhueta PRÓPRIA e
 * detalhada — reconhecível sozinha, sem precisar ler o nome truncado embaixo. Duas armas
 * fisicamente diferentes (espada longa × adaga) não podem desenhar a mesma coisa só
 * porque as duas são "arma branca": por isso o combate aqui vira quatro símbolos
 * (espada, adaga, machado, lança), não um só.
 */
import type { ReactNode } from 'react'

/** Lado do viewBox — mesmo valor usado por `AcervoCenario.tsx` ao montar o `<svg>`. */
export const TAM_ARTE_INVENTARIO = 64

const CREME = '#f2efe6'
const TINTA = '#1a1410'
const ACO = '#d9d6cc'
const MADEIRA = '#8a6a42'
const CHAMA = '#ff9d3d'
const SANGUE = '#8a2e2e'

/** Fundo do slot: quadrado arredondado na cor EXCLUSIVA do item (`corFundoItem` em
 * `arteItem.ts`, por `id`). Antes era tingido por categoria ("toda arma branca vermelha")
 * — dava agrupamento de relance, mas colapsava itens diferentes na mesma mancha de cor,
 * que é exatamente o que o slot existe pra evitar. Cor vem de fora (quem desenha decide),
 * este módulo só pinta o retângulo. */
function fundoComCor(cor: string): ReactNode {
  return <rect x={2} y={2} width={60} height={60} rx={10} fill={cor} stroke={TINTA} strokeWidth={1.5} />
}

/** Cada função devolve só o ÍCONE (centrado em 32,32); o fundo colorido vem à parte. */
const ICONES: Record<string, () => ReactNode> = {
  /** frasco com rolha e um traço de brilho — o líquido é o que distingue de "erva" */
  pocao: () => (
    <g>
      <rect x={26} y={8} width={12} height={9} rx={1} fill={MADEIRA} stroke={TINTA} strokeWidth={1.5} />
      <path
        d="M 20 44 L 20 24 L 26 16 L 38 16 L 44 24 L 44 44 C 44 49 39 53 32 53 C 25 53 20 49 20 44 Z"
        fill={CREME}
        stroke={TINTA}
        strokeWidth={1.8}
      />
      <path d="M 21 38 C 21 44 26 48 32 48 C 38 48 43 44 43 38 L 43 44 C 43 49 38 52 32 52 C 26 52 21 49 21 44 Z" fill={SANGUE} opacity={0.85} />
      <line x1={25} y1={22} x2={25} y2={34} stroke="#ffffff" strokeWidth={1.5} opacity={0.5} strokeLinecap="round" />
    </g>
  ),

  /** trevo de três folhas com haste — silhueta orgânica, oposta à geometria do frasco */
  erva: () => (
    <g fill="#dff0d8" stroke={TINTA} strokeWidth={1.4}>
      <ellipse cx={32} cy={26} rx={9} ry={13} />
      <ellipse cx={19} cy={36} rx={8} ry={11.5} transform="rotate(-42 19 36)" />
      <ellipse cx={45} cy={36} rx={8} ry={11.5} transform="rotate(42 45 36)" />
      <line x1={32} y1={39} x2={32} y2={54} stroke="#5a7d3a" strokeWidth={2.4} strokeLinecap="round" />
    </g>
  ),

  /** anel + haste denteada — dois dentes, não um, pra ficar chave de verdade em silhueta */
  chave: () => (
    <g fill="none" stroke={CREME} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={22} cy={22} r={9} />
      <line x1={28} y1={28} x2={47} y2={47} />
      <line x1={38} y1={38} x2={44} y2={32} />
      <line x1={43} y1={43} x2={49} y2={37} />
    </g>
  ),

  /** pergaminho: dobra no canto + selo de cera — o selo é o que separa de "livro" */
  documento: () => (
    <g>
      <path d="M 16 10 L 40 10 L 48 18 L 48 54 L 16 54 Z" fill={CREME} stroke={TINTA} strokeWidth={1.8} />
      <path d="M 40 10 L 40 18 L 48 18 Z" fill="#c9c4b0" stroke={TINTA} strokeWidth={1.2} />
      <g stroke="#4a4436" strokeWidth={1.6}>
        <line x1={21} y1={26} x2={38} y2={26} />
        <line x1={21} y1={32} x2={38} y2={32} />
        <line x1={21} y1={38} x2={33} y2={38} />
      </g>
      <circle cx={38} cy={47} r={5} fill={SANGUE} stroke={TINTA} strokeWidth={1.2} />
    </g>
  ),

  /** moeda antiga: dois anéis + losango central — evita se parecer com o anel da chave */
  moeda: () => (
    <g stroke={CREME} fill="none">
      <circle cx={32} cy={32} r={17} strokeWidth={3.4} />
      <circle cx={32} cy={32} r={11} strokeWidth={1.6} />
      <path d="M 32 25 L 37 32 L 32 39 L 27 32 Z" fill={CREME} stroke="none" />
    </g>
  ),

  /** colarinho de duas pontas erguidas + corpo afunilando pra barra larga + broche no
   * pescoço — nenhum desses três traços existe no ícone genérico (que é uma forma
   * arredondada única, sem colarinho nem broche, e foi lida como cadeado/mochila). O
   * afunilamento (estreito no ombro, largo na barra) é a silhueta clássica de manto/capa
   * caindo do corpo — o contrário de uma caixa ou saco de contorno reto. */
  vestuario: () => (
    <g stroke={TINTA} strokeLinejoin="round">
      <path d="M 15 20 L 11 8 L 24 15 Z" fill={ACO} strokeWidth={1.3} />
      <path d="M 49 20 L 53 8 L 40 15 Z" fill={ACO} strokeWidth={1.3} />
      <path
        d="M 24 12 L 40 12 C 43 13 43 16 41 18 L 49 48 C 50 53 42 57 32 57 C 22 57 14 53 15 48 L 23 18 C 21 16 21 13 24 12 Z"
        fill={CREME}
        strokeWidth={1.6}
      />
      <line x1={26} y1={22} x2={22} y2={50} stroke={TINTA} strokeWidth={1} opacity={0.3} />
      <line x1={38} y1={22} x2={42} y2={50} stroke={TINTA} strokeWidth={1} opacity={0.3} />
      <circle cx={32} cy={16} r={3.2} fill={SANGUE} strokeWidth={1} />
    </g>
  ),

  /** lâmina longa e estreita, guarda larga, punho e pomo — "longa" é o traço central */
  espada: () => (
    <g stroke={TINTA} strokeLinejoin="round">
      <path d="M 30 6 L 34 6 L 36 38 L 32 44 L 28 38 Z" fill={ACO} strokeWidth={1.4} />
      <line x1={32} y1={9} x2={32} y2={36} stroke={TINTA} strokeWidth={0.9} opacity={0.4} />
      <rect x={20} y={36} width={24} height={4} rx={1.5} fill={MADEIRA} strokeWidth={1.2} />
      <rect x={29} y={40} width={6} height={12} rx={1.5} fill={MADEIRA} strokeWidth={1.2} />
      <circle cx={32} cy={54} r={4} fill={MADEIRA} strokeWidth={1.2} />
    </g>
  ),

  /** lâmina em losango CURTO e GORDO (não afilado como a ponta de lança) + guarda que
   * ULTRAPASSA a lâmina dos dois lados — é essa barra larga em T que faltava: sem ela, o
   * losango sozinho lê como ponta de lança/seta (o defeito relatado). Lança não tem guarda
   * nenhuma; aqui a guarda é o traço mais largo do desenho inteiro. */
  adaga: () => (
    <g stroke={TINTA} strokeLinejoin="round">
      <path d="M 32 13 L 43 26 L 32 35 L 21 26 Z" fill={ACO} strokeWidth={1.4} />
      <rect x={14} y={31} width={36} height={5.5} rx={2} fill={MADEIRA} strokeWidth={1.2} />
      <rect x={29} y={36.5} width={6} height={11} rx={1.5} fill={SANGUE} strokeWidth={1.1} />
      <circle cx={32} cy={51} r={3.5} fill={MADEIRA} strokeWidth={1} />
    </g>
  ),

  /** cabeça em crescente sobre cabo longo — a única arma da lista sem lâmina reta */
  machado: () => (
    <g stroke={TINTA} strokeLinejoin="round">
      <rect x={29.5} y={10} width={5} height={44} rx={1.5} fill={MADEIRA} strokeWidth={1.3} />
      <path
        d="M 32 14 C 44 14 48 22 44 30 C 40 26 35 24 32 24 Z"
        fill={ACO}
        strokeWidth={1.4}
      />
    </g>
  ),

  /** haste fina quase inteira + ponta em losango — só ela não tem guarda nenhuma */
  lanca: () => (
    <g stroke={TINTA} strokeLinejoin="round">
      <rect x={30.5} y={16} width={3} height={40} rx={1} fill={MADEIRA} strokeWidth={1.1} />
      <path d="M 32 5 L 38 18 L 32 24 L 26 18 Z" fill={ACO} strokeWidth={1.4} />
    </g>
  ),

  /** flecha diagonal com penas na cauda — as penas são o que falta em "lança" */
  municao: () => (
    <g stroke={CREME} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1={16} y1={48} x2={46} y2={18} />
      <path d="M 34 18 L 46 18 L 46 30" />
      <path d="M 16 48 L 22 46 M 16 48 L 18 42" strokeWidth={2.4} />
    </g>
  ),

  /** livro fechado com lombada e uma fita marcador saindo do topo */
  livro: () => (
    <g>
      <rect x={16} y={10} width={32} height={44} rx={2.5} fill={SANGUE} stroke={TINTA} strokeWidth={1.6} />
      <rect x={16} y={10} width={32} height={44} rx={2.5} fill="none" stroke={TINTA} strokeWidth={1.6} />
      <line x1={26} y1={10} x2={26} y2={54} stroke={TINTA} strokeWidth={1.4} opacity={0.5} />
      <rect x={34} y={6} width={5} height={16} fill="#d9c66a" stroke={TINTA} strokeWidth={1} />
      <path d="M 34 22 L 36.5 18 L 39 22 Z" fill="#d9c66a" stroke={TINTA} strokeWidth={1} />
    </g>
  ),

  /** chama sobre cabo de madeira — o cabo é o que faltava pra não virar "só fogo" */
  tocha: () => (
    <g>
      <rect x={29} y={34} width={6} height={22} rx={1.5} fill={MADEIRA} stroke={TINTA} strokeWidth={1.3} />
      <path
        d="M 32 8 C 42 16 40 26 32 34 C 24 26 22 16 32 8 Z"
        fill={CHAMA}
        stroke={TINTA}
        strokeWidth={1.2}
      />
      <path d="M 32 15 C 37 20 36 25 32 29 C 28 25 27 20 32 15 Z" fill="#ffd77a" />
    </g>
  ),

  /** coxa com osso saindo — silhueta única, sem depender de cor de comida específica */
  comida: () => (
    <g>
      <circle cx={29} cy={22} r={13} fill="#c47a3f" stroke={TINTA} strokeWidth={1.6} />
      <rect x={26} y={30} width={9} height={20} rx={4} fill="#c47a3f" stroke={TINTA} strokeWidth={1.6} transform="rotate(28 26 30)" />
      <rect x={34} y={44} width={5} height={12} rx={2.5} fill={CREME} stroke={TINTA} strokeWidth={1.2} transform="rotate(28 34 44)" />
    </g>
  ),
}

function iconeGenerico(): ReactNode {
  return (
    <g stroke={TINTA} strokeLinejoin="round">
      <path
        d="M 20 30 C 20 24 25 20 32 20 C 39 20 44 24 44 30 L 47 50 C 47 53 45 55 42 55 L 22 55 C 19 55 17 53 17 50 Z"
        fill={CREME}
        strokeWidth={1.6}
      />
      <path d="M 25 30 C 25 26 28 24 32 24 C 36 24 39 26 39 30" fill="none" strokeWidth={2} strokeLinecap="round" />
      <line x1={17} y1={38} x2={47} y2={38} stroke={TINTA} strokeWidth={1.2} opacity={0.4} />
    </g>
  )
}

/** Desenha o slot completo (fundo na cor exclusiva do item + ícone) pro símbolo reconhecido no nome. */
export function desenharArteInventario(simbolo: string, cor: string): ReactNode {
  const icone = ICONES[simbolo]
  if (!icone) return desenharArteGenericaInventario(cor)
  return (
    <>
      {fundoComCor(cor)}
      {icone()}
    </>
  )
}

/** Fallback pra item sem palavra-chave reconhecida no nome — nunca cai num glifo cru. */
export function desenharArteGenericaInventario(cor: string): ReactNode {
  return (
    <>
      {fundoComCor(cor)}
      {iconeGenerico()}
    </>
  )
}

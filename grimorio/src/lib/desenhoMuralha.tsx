import { arestasDeCaixa, contornoComVaos } from './ancoraPorta'
import { MURALHA_COR_CONTORNO, ESPESSURA_CONTORNO_MURALHA } from './muralhaMapa'

/**
 * Miolo do desenho da muralha — mesmo padrão de `desenharCorredor`. Só o CONTORNO é
 * desenhado (fill "none"): a muralha cerca o que já está desenhado por dentro dela sem
 * cobrir nada, ao contrário da sala/corredor, que são preenchidos.
 *
 * O retângulo do stroke fica encolhido por `ESPESSURA_CONTORNO_MURALHA / 2` de cada lado
 * porque o SVG centra o traço na borda do `<rect>` — sem o encolhimento, metade da linha
 * vazaria para fora da caixa que o usuário vê e arrasta no editor.
 */

export interface DesenharMuralhaProps {
  w: number
  h: number
  /** cor da linha do cerco; vazio = a cor padrão */
  cor?: string
  /**
   * Sem `contorno` aqui: a muralha É só contorno (`fill="none"`), então desligá-la apagaria a
   * peça inteira em vez de simplificá-la. Quem quer a muralha sumindo apaga a muralha.
   */
  /**
   * Vãos abertos pelas portas ancoradas, por índice de aresta. Ver `contornoComVaos`.
   *
   * Sem isto a peça desenha a parede por cima da porta e a planta afirma passagem fechada.
   */
  vaos?: Map<number, Array<{ inicio: number; fim: number }>>

}

export function desenharMuralha({ w, h, cor, vaos }: DesenharMuralhaProps) {
  // O retângulo do traço fica encolhido por meia espessura de cada lado porque o SVG centra
  // o stroke na borda — sem isso metade da linha vazaria para fora da caixa que o usuário
  // arrasta. Os traços seguem essa mesma caixa encolhida, senão o vão da porta cairia
  // deslocado do contorno.
  const meia = ESPESSURA_CONTORNO_MURALHA / 2
  const anel = arestasDeCaixa(
    Math.max(0, w - ESPESSURA_CONTORNO_MURALHA),
    Math.max(0, h - ESPESSURA_CONTORNO_MURALHA),
  ).map((a) => ({ x: a.a.x + meia, y: a.a.y + meia }))

  return (
    <>
      {contornoComVaos(anel, vaos).map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={cor || MURALHA_COR_CONTORNO}
          strokeWidth={ESPESSURA_CONTORNO_MURALHA}
          strokeLinecap="butt"
        />
      ))}
    </>
  )
}

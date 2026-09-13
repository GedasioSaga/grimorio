import { useEffect, useState } from 'react'
import type { Item } from '../lib/types'
import { corFundoItem, escolherSimboloItem } from '../lib/arteItem'
import { urlRetrato } from '../lib/urlRetrato'
import { posicaoCss } from '../lib/focoRetrato'
import { desenharArteGenericaInventario, desenharArteInventario, TAM_ARTE_INVENTARIO } from '../lib/arteInventario'

/**
 * Retrato > símbolo vetorial (palpite pelo nome) > pino genérico. Nunca cai num emoji cru.
 * Arquivo próprio porque dois lugares desenham o mesmo item: a grade do acervo na ficha e a
 * faixa de itens do card de cenário no canvas.
 */
export function ArteDoItem({ item, vaultPath }: { item: Item; vaultPath: string | null }) {
  const src = urlRetrato(vaultPath, item.retrato, item.modificadoEm)
  const [erro, setErro] = useState(false)
  useEffect(() => setErro(false), [src])

  if (src && !erro) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        style={{ objectPosition: posicaoCss(item.foco) }}
        onError={() => setErro(true)}
      />
    )
  }

  const simbolo = escolherSimboloItem(item.nome)
  const cor = corFundoItem(item.id)
  return (
    <svg
      viewBox={`0 0 ${TAM_ARTE_INVENTARIO} ${TAM_ARTE_INVENTARIO}`}
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      {simbolo ? desenharArteInventario(simbolo, cor) : desenharArteGenericaInventario(cor)}
    </svg>
  )
}

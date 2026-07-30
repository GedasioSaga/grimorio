import { useEffect, useRef, useState } from 'react'
import type { FocoRetrato } from '../lib/types'
import { PRESETS_FOCO, cantoDoFoco, focoDeCanto, posicaoCss } from '../lib/focoRetrato'

/**
 * Escolhe que parte do retrato aparece no círculo do perfil.
 *
 * A imagem inteira fica à vista com um quadrado de seleção por cima; arrastar o quadrado é
 * o mesmo que mover o `object-position`. Toda a conta mora em `focoRetrato.ts` — aqui só se
 * mede o DOM e se liga evento.
 */
export function EnquadrarRetrato({ src, focoInicial, aoSalvar, aoFechar }: {
  src: string
  focoInicial?: FocoRetrato
  aoSalvar: (foco: FocoRetrato) => void
  aoFechar: () => void
}) {
  const [foco, setFoco] = useState<FocoRetrato>(focoInicial ?? PRESETS_FOCO.centro)
  const [caixa, setCaixa] = useState<{ largura: number; altura: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const arrasto = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null)

  function medir() {
    const el = imgRef.current
    if (el && el.clientWidth > 0) setCaixa({ largura: el.clientWidth, altura: el.clientHeight })
  }

  // imagem em cache pode terminar de carregar antes do onLoad estar ligado, e aí o quadro
  // nunca apareceria — medir também na montagem cobre esse caso
  useEffect(() => { medir() }, [src])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar() } }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const lado = caixa ? Math.min(caixa.largura, caixa.altura) : 0
  const canto = caixa ? cantoDoFoco(caixa.largura, caixa.altura, lado, foco) : { x: 0, y: 0 }

  function aoPressionar(e: React.PointerEvent<HTMLDivElement>) {
    if (!caixa) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    arrasto.current = { px: e.clientX, py: e.clientY, cx: canto.x, cy: canto.y }
  }
  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrasto.current
    if (!a || !caixa) return
    setFoco(focoDeCanto(
      caixa.largura, caixa.altura, lado,
      a.cx + (e.clientX - a.px),
      a.cy + (e.clientY - a.py),
    ))
  }
  function aoSoltar(e: React.PointerEvent<HTMLDivElement>) {
    arrasto.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); aoFechar() }}>
      <div className="enquadrar-caixa" onClick={(e) => e.stopPropagation()}>
        <div className="dialogo-titulo">Enquadrar retrato</div>

        <div className="enquadrar-corpo">
          <div className="enquadrar-palco">
            <img ref={imgRef} className="enquadrar-imagem" src={src} alt="" draggable={false} onLoad={medir} />
            {caixa && (
              <div
                className="enquadrar-quadro"
                style={{ left: canto.x, top: canto.y, width: lado, height: lado }}
                onPointerDown={aoPressionar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
              />
            )}
          </div>

          <div className="enquadrar-lado">
            <div className="enquadrar-previa" title="Como vai ficar no perfil">
              <img src={src} alt="" draggable={false} style={{ objectPosition: posicaoCss(foco) }} />
            </div>
            <button onClick={() => setFoco(PRESETS_FOCO.topo)}>Topo</button>
            <button onClick={() => setFoco(PRESETS_FOCO.centro)}>Centro</button>
            <button onClick={() => setFoco(PRESETS_FOCO.base)}>Base</button>
            <p className="enquadrar-dica">Arraste o quadro sobre a imagem.</p>
          </div>
        </div>

        <div className="dialogo-botoes">
          <button onClick={aoFechar}>Cancelar</button>
          <button className="dialogo-ok" onClick={() => aoSalvar(foco)}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'
import { useApp } from '../state/store'
import { useFaixaItensFoco } from '../state/faixaItensFoco'
import type { Item, ItemNoCenario } from '../lib/types'
import { acervoVivo } from '../lib/acervoCenario'
import { formatarContador } from '../lib/arteItem'
import { urlRetrato } from '../lib/urlRetrato'
import { copiarImagemParaClipboard } from '../lib/copiarImagem'
import type { LadoFaixa } from '../lib/faixaItensCenario'
import { ArteDoItem } from './ArteDoItem'

/** Quanto tempo o "Copiado" fica no item depois do clique. */
const AVISO_COPIA_MS = 1500

type EstadoCopia = { itemId: string; ok: boolean } | null

/** Dentro do card o tldraw captura o ponteiro: sem isto o clique arrasta o card ou o expande. */
const pararNoCard = (e: ReactPointerEvent) => e.stopPropagation()

/** `Nome · 3× · resumo`, sem as partes vazias. */
export function rotuloDoItemNaFaixa(item: Pick<Item, 'nome' | 'resumo'>, qtd: number | undefined): string {
  const contador = formatarContador(qtd)
  return [item.nome, contador ? `${contador}×` : '', item.resumo.trim()].filter(Boolean).join(' · ')
}

/**
 * Faixa com o acervo da versão ativa do cenário, grudada no card do canvas. Mostra os itens
 * de verdade (os da aba Itens da ficha): clique põe o item em foco para o Ctrl+C, duplo clique
 * abre a ficha, 📋 copia a imagem. Adicionar e tirar item continua sendo coisa da ficha.
 */
export function FaixaItensCenario({ shapeId, acervo, lado }: {
  shapeId: TLShapeId
  acervo: ItemNoCenario[]
  lado: Exclude<LadoFaixa, 'oculta'>
}) {
  const editor = useEditor()
  const itens = useApp((s) => s.itens)
  const vaultPath = useApp((s) => s.vaultPath)
  const foco = useFaixaItensFoco((s) => s.foco)
  const [copia, setCopia] = useState<EstadoCopia>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const vivos = acervoVivo(acervo, itens)
  const itemEmFoco = foco?.shapeId === shapeId ? foco.itemId : null
  const cardSelecionado = useValue('card da faixa selecionado', () => editor.getSelectedShapeIds().includes(shapeId), [
    editor,
    shapeId,
  ])

  // o foco só vale enquanto o card está selecionado E o item ainda está na faixa: senão um
  // Ctrl+C mais tarde copiaria um item esquecido — de outra versão do cenário, ou já tirado
  // do acervo pela ficha — em vez da imagem do cenário
  const focoNaFaixa = itemEmFoco !== null && vivos.some((a) => a.itemId === itemEmFoco)
  useEffect(() => {
    if (itemEmFoco && (!cardSelecionado || !focoNaFaixa)) useFaixaItensFoco.getState().limpar()
  }, [cardSelecionado, itemEmFoco, focoNaFaixa])

  // faixa deitada rola para o lado, mas roda comum só manda deltaY: sem converter, os itens
  // além da largura do card ficam fora de alcance (a guarda do card para a roda aqui dentro)
  const faixaRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = faixaRef.current
    if (!el || (lado !== 'baixo' && lado !== 'cima')) return
    const aoRolar = (e: WheelEvent) => {
      if (e.deltaX === 0) el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', aoRolar, { passive: true })
    return () => el.removeEventListener('wheel', aoRolar)
  }, [lado])

  // faixa escondida ou card apagado: o foco não pode sobreviver a quem o mostrava
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (useFaixaItensFoco.getState().foco?.shapeId === shapeId) useFaixaItensFoco.getState().limpar()
    },
    [shapeId],
  )

  const avisarCopia = (itemId: string, ok: boolean) => {
    if (timer.current) clearTimeout(timer.current)
    setCopia({ itemId, ok })
    timer.current = setTimeout(() => setCopia(null), AVISO_COPIA_MS)
  }

  const copiar = (item: Item) => {
    const src = urlRetrato(vaultPath, item.retrato, item.modificadoEm)
    if (!src) return
    copiarImagemParaClipboard(src)
      .then(() => avisarCopia(item.id, true))
      .catch((err) => {
        console.error('Falha ao copiar imagem do item:', err)
        avisarCopia(item.id, false)
      })
  }

  return (
    // pointerdown parado na faixa inteira: arrastar a barra de rolagem não pode arrastar o card
    <div ref={faixaRef} className={`faixa-itens faixa-itens-${lado}`} onPointerDown={pararNoCard}>
      {vivos.length === 0 ? (
        <div className="faixa-itens-vazia">Sem itens no acervo</div>
      ) : (
        vivos.map(({ itemId, qtd }) => {
          const item = itens[itemId]
          if (!item) return null
          const contador = formatarContador(qtd)
          const temImagem = Boolean(urlRetrato(vaultPath, item.retrato, item.modificadoEm))
          const avisoAqui = copia?.itemId === itemId ? copia : null
          return (
            <div
              key={itemId}
              className={`faixa-item${itemEmFoco === itemId ? ' faixa-item-foco' : ''}`}
              title={rotuloDoItemNaFaixa(item, qtd)}
            >
              <button
                type="button"
                className="faixa-item-arte"
                aria-label={`${item.nome} (duplo clique abre a ficha)`}
                aria-pressed={itemEmFoco === itemId}
                onPointerDown={pararNoCard}
                onClick={() => {
                  editor.select(shapeId)
                  useFaixaItensFoco.getState().focar({ shapeId, itemId })
                }}
                onDoubleClick={() => useApp.getState().abrirItem(itemId)}
              >
                <ArteDoItem item={item} vaultPath={vaultPath} />
                {contador && (
                  <span className="faixa-item-qtd" aria-hidden="true">
                    {contador}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="faixa-item-copiar"
                disabled={!temImagem}
                title={temImagem ? 'Copiar a imagem' : 'Item sem imagem'}
                aria-label={`Copiar a imagem de ${item.nome}`}
                onPointerDown={pararNoCard}
                onClick={() => copiar(item)}
              >
                📋
              </button>
              {avisoAqui && (
                <span className={`faixa-item-aviso${avisoAqui.ok ? '' : ' faixa-item-aviso-erro'}`} role="status">
                  {avisoAqui.ok ? 'Copiado' : 'Falhou'}
                </span>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

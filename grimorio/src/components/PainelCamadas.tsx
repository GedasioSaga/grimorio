import { useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { pedirTexto } from './dialogos'
import type { CamadaMapa } from '../lib/types'

/**
 * Painel de camadas do Mapa (Fatia 3): coluna direita colapsável do `.mapa-wrap`,
 * fora do `<Tldraw>`. Componente burro — só apresenta `camadas` e chama os callbacks;
 * quem possui o estado, aplica `getShapeVisibility`/`isLocked` e persiste é o MapaView.
 */
export function PainelCamadas({
  camadas,
  ativaId,
  aoSelecionarAtiva,
  aoCriar,
  aoRenomear,
  aoExcluir,
  aoAlternarOculta,
  aoAlternarTravada,
  aoMover,
}: {
  camadas: CamadaMapa[]
  ativaId: string
  aoSelecionarAtiva: (id: string) => void
  aoCriar: (nome: string) => void
  aoRenomear: (id: string, nome: string) => void
  aoExcluir: (id: string) => void
  aoAlternarOculta: (id: string) => void
  aoAlternarTravada: (id: string) => void
  aoMover: (id: string, direcao: 'cima' | 'baixo') => void
}) {
  const [colapsado, setColapsado] = useState(false)

  async function criar() {
    const nome = await pedirTexto('Nome da nova camada', '', 'Criar')
    if (nome) aoCriar(nome)
  }

  async function renomear(camada: CamadaMapa) {
    const nome = await pedirTexto('Renomear camada', camada.nome, 'Renomear')
    if (nome) aoRenomear(camada.id, nome)
  }

  async function excluir(camada: CamadaMapa) {
    if (camadas.length <= 1) return
    const ok = await ask(`Excluir a camada "${camada.nome}"? As formas dela passam para a camada vizinha.`, {
      title: 'Grimório', kind: 'warning',
    })
    if (ok) aoExcluir(camada.id)
  }

  if (colapsado) {
    return (
      <button
        type="button"
        className="painel-camadas-reabrir"
        title="Mostrar camadas"
        onClick={() => setColapsado(false)}
      >
        🗂
      </button>
    )
  }

  return (
    <div className="painel-camadas">
      <div className="painel-camadas-cabecalho">
        <span>Camadas</span>
        <button type="button" className="btn-icon" title="Esconder painel" onClick={() => setColapsado(true)}>»</button>
      </div>
      <ul className="painel-camadas-lista">
        {camadas.map((camada) => (
          <li
            key={camada.id}
            className={`painel-camadas-item${camada.id === ativaId ? ' ativa' : ''}`}
            onClick={() => aoSelecionarAtiva(camada.id)}
          >
            <span className="painel-camadas-nome" title="Duplo-clique: renomear" onDoubleClick={() => void renomear(camada)}>
              {camada.nome}
            </span>
            <span className="painel-camadas-acoes">
              <button
                type="button"
                className="btn-icon"
                title={camada.oculta ? 'Mostrar camada' : 'Esconder camada'}
                onClick={(e) => { e.stopPropagation(); aoAlternarOculta(camada.id) }}
              >
                {camada.oculta ? '🚫' : '👁'}
              </button>
              <button
                type="button"
                className="btn-icon"
                title={camada.travada ? 'Destravar camada' : 'Travar camada'}
                onClick={(e) => { e.stopPropagation(); aoAlternarTravada(camada.id) }}
              >
                {camada.travada ? '🔒' : '🔓'}
              </button>
              <button
                type="button"
                className="btn-icon"
                title="Mover para cima"
                onClick={(e) => { e.stopPropagation(); aoMover(camada.id, 'cima') }}
              >
                ▲
              </button>
              <button
                type="button"
                className="btn-icon"
                title="Mover para baixo"
                onClick={(e) => { e.stopPropagation(); aoMover(camada.id, 'baixo') }}
              >
                ▼
              </button>
              {camadas.length > 1 && (
                <button
                  type="button"
                  className="btn-icon"
                  title="Excluir camada"
                  onClick={(e) => { e.stopPropagation(); void excluir(camada) }}
                >
                  🗑
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="painel-camadas-add" onClick={() => void criar()}>+ camada</button>
    </div>
  )
}

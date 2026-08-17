import { useEffect, useState } from 'react'
import { message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { Item, ItemNoCenario } from '../lib/types'
import { acervoVivo, adicionarAoAcervo, definirQtd, removerDoAcervo, type AtualizadorAcervo } from '../lib/acervoCenario'
import { corFundoItem, escolherSimboloItem, formatarContador } from '../lib/arteItem'
import { urlRetrato } from '../lib/urlRetrato'
import { posicaoCss } from '../lib/focoRetrato'
import { desenharArteGenericaInventario, desenharArteInventario, TAM_ARTE_INVENTARIO } from '../lib/arteInventario'
import { associarNaCriacao } from './dialogoCampanhas'
import '../estilos/inventario.css'

const RAIZ = 'itens'
const MAX_CANDIDATOS = 8

/**
 * Itens de verdade presentes nesta versão — de CENÁRIO ou de PERSONAGEM: as duas fichas
 * guardam o mesmo formato (`ItemNoCenario[]`), então um componente só atende as duas (o
 * nome ficou de quando só cenário tinha acervo; renomear quebraria `CenaFicha.tsx` e o
 * teste de regressão da race de criação, nenhum dos dois no escopo desta peça).
 *
 * Grade de slots ao estilo "baú de RPG": arte grande ocupando o slot, contador no canto,
 * nome embaixo — pensado pra se ler de relance, ao contrário da fileira de chips de texto
 * que havia antes. Fica ACIMA do texto livre da aba (quando há um): o slot é referência
 * (abre a ficha, some se o item for excluído), o texto continua sendo o rascunho de quem
 * não quer cadastrar nada.
 */
export function AcervoCenario({ acervo, onChange, className = '' }: {
  acervo: ItemNoCenario[]
  onChange: (mudanca: AtualizadorAcervo) => void
  /** extra pro wrapper — ver `.inventario-acervo-cheio` (personagem, sem texto livre abaixo) */
  className?: string
}) {
  const itens = useApp((s) => s.itens)
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const abrirItem = useApp((s) => s.abrirItem)
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)

  const vivos = acervoVivo(acervo, itens)
  const termo = busca.trim()
  const termoLower = termo.toLowerCase()
  const candidatos = termo
    ? Object.values(itens)
        .filter((i) => i.nome.toLowerCase().includes(termoLower) && !acervo.some((a) => a.itemId === i.id))
        .slice(0, MAX_CANDIDATOS)
    : []
  // nome idêntico já cadastrado: oferecer "criar" seria convidar a duplicata
  const nomeJaExiste = Object.values(itens).some((i) => i.nome.toLowerCase() === termoLower)

  function vincular(itemId: string) {
    onChange((atual) => adicionarAoAcervo(atual, itemId))
    setBusca('')
  }

  async function criarEVincular() {
    if (!repo || !termo || criando) return
    setCriando(true)
    try {
      const ref = await repo.criarItemEm(RAIZ, termo)
      await associarNaCriacao('item', ref.id, termo, RAIZ)
      const { recarregarArvore, carregarItens } = useApp.getState()
      await recarregarArvore()
      await carregarItens() // sem isto o item novo não está no cache e o slot nasceria órfão
      // updater, não o `acervo` capturado no início: a associação de campanha (modal) e os
      // recarregamentos acima dão tempo do usuário mexer no acervo concorrentemente
      vincular(ref.id)
    } catch (e) {
      await message(`Falha ao criar o item: ${e}`, { title: 'Grimório', kind: 'error' })
    } finally {
      setCriando(false)
    }
  }

  return (
    <div className={`cenario-acervo ${className}`.trim()}>
      <div className="grupo-titulo">Itens do acervo</div>
      {vivos.length > 0 ? (
        <div className="inventario-grade">
          {vivos.map((a) => (
            <SlotInventario
              key={a.itemId}
              item={itens[a.itemId]}
              qtd={a.qtd}
              vaultPath={vaultPath}
              aoAbrir={() => abrirItem(a.itemId)}
              aoAjustarQtd={(nova) => onChange(definirQtd(acervo, a.itemId, nova))}
              aoRemover={() => onChange(removerDoAcervo(acervo, a.itemId))}
            />
          ))}
        </div>
      ) : (
        <p className="galeria-vazia">Nenhum item do acervo aqui ainda.</p>
      )}
      <div className="cenario-vincular">
        <input
          placeholder="+ Adicionar item do acervo (busque pelo nome)…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || candidatos.length === 0) return
            const exato = candidatos.find((i) => i.nome.toLowerCase() === termoLower)
            vincular((exato ?? candidatos[0]).id)
          }}
        />
        {candidatos.map((i) => (
          <button
            key={i.id}
            className="cenario-sub-item"
            onClick={() => vincular(i.id)}
          >
            💎 {i.nome}
          </button>
        ))}
        {termo && !nomeJaExiste && (
          <button className="cenario-sub-item acervo-criar" disabled={criando} onClick={() => void criarEVincular()}>
            {criando ? 'Criando…' : `+ Criar “${termo}” no acervo`}
          </button>
        )}
      </div>
    </div>
  )
}

/** Um slot da grade: arte do item, contador no canto, nome embaixo, ações de qtd/remover no hover/foco. */
function SlotInventario({ item, qtd, vaultPath, aoAbrir, aoAjustarQtd, aoRemover }: {
  item: Item
  qtd: number | undefined
  vaultPath: string | null
  aoAbrir: () => void
  aoAjustarQtd: (novaQtd: number | undefined) => void
  aoRemover: () => void
}) {
  const contador = formatarContador(qtd)
  const atual = qtd ?? 1

  return (
    <div className="inventario-slot">
      <button
        type="button"
        className="inventario-slot-arte"
        onClick={aoAbrir}
        title={`Abrir a ficha de ${item.nome}`}
        aria-label={`Abrir a ficha de ${item.nome}`}
      >
        <ArteDoItem item={item} vaultPath={vaultPath} />
        {contador && <span className="inventario-slot-qtd" aria-hidden="true">{contador}</span>}
      </button>
      <div className="inventario-slot-nome" title={item.nome}>{item.nome}</div>
      <div className="inventario-slot-acoes">
        <button
          type="button"
          className="inventario-slot-btn"
          title="Diminuir quantidade"
          aria-label={`Diminuir quantidade de ${item.nome}`}
          onClick={() => aoAjustarQtd(atual - 1)}
        >
          −
        </button>
        <input
          type="number"
          className="inventario-slot-qtd-input"
          min={1}
          placeholder="1"
          title="Quantidade (vazio = único)"
          aria-label={`Quantidade de ${item.nome}`}
          value={qtd ?? ''}
          onChange={(e) => aoAjustarQtd(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        <button
          type="button"
          className="inventario-slot-btn"
          title="Aumentar quantidade"
          aria-label={`Aumentar quantidade de ${item.nome}`}
          onClick={() => aoAjustarQtd(atual + 1)}
        >
          +
        </button>
        <button
          type="button"
          className="inventario-slot-btn inventario-slot-remover"
          title="Tirar do acervo (não exclui o item)"
          aria-label={`Tirar ${item.nome} do acervo`}
          onClick={aoRemover}
        >
          ×
        </button>
      </div>
    </div>
  )
}

/** Retrato > símbolo vetorial (palpite pelo nome) > pino genérico. Nunca cai num emoji cru. */
function ArteDoItem({ item, vaultPath }: { item: Item; vaultPath: string | null }) {
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

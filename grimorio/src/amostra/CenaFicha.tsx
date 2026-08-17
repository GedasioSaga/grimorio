import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { AcervoCenario } from '../components/AcervoCenario'
import { BarraLocalizacao } from '../components/BarraLocalizacao'
import type { ItemNoCenario } from '../lib/types'
import type { AtualizadorAcervo } from '../lib/acervoCenario'
import { versaoAtivaPersonagem } from '../lib/personagemVersao'
import {
  ACERVO_INICIAL,
  ARVORE_FALSA,
  CAMINHO_CENARIO_POR_ID_FALSO,
  CAMINHO_ITEM_POR_ID_FALSO,
  CAMINHO_PERSONAGEM_POR_ID_FALSO,
  CENARIO_FALSO,
  CENARIO_SUBSOLO_FALSO,
  ITENS_FALSOS,
  PERSONAGEM_FALSO,
} from './dadosFalsos'
import '../estilos/localizacao.css'

/**
 * Cena #ficha: componentes REAIS que as três fichas (cenário, personagem, item)
 * compartilham — `AcervoCenario.tsx` (acervo de cenário E inventário de personagem, a
 * mesma seção que a aba "Itens" do `PerfilModal` usa) e `BarraLocalizacao.tsx` (as três
 * fichas) —, alimentados com uma `VaultTree` falsa plausível em memória.
 *
 * `repo: null` no store é o que faz toda ação que gravaria em disco virar no-op: o
 * `AcervoCenario` já checa `if (!repo) return` antes de `criarEVincular`, e a
 * `BarraLocalizacao` faz o mesmo antes de mover/absorver — nenhuma delas crasha nem finge
 * sucesso, só não fazem nada visível sozinhas, por isso o aviso fixo abaixo de cada barra.
 */
export function CenaFicha() {
  const itemAbertoId = useApp((s) => s.itemAbertoId)
  const [acervoCenario, setAcervoCenario] = useState<ItemNoCenario[]>(ACERVO_INICIAL)
  const [acervoPersonagem, setAcervoPersonagem] = useState<ItemNoCenario[]>(
    () => versaoAtivaPersonagem(PERSONAGEM_FALSO).acervo ?? [],
  )

  useEffect(() => {
    useApp.setState({
      itens: Object.fromEntries(ITENS_FALSOS.map((i) => [i.id, i])),
      caminhoItemPorId: CAMINHO_ITEM_POR_ID_FALSO,
      personagens: { [PERSONAGEM_FALSO.id]: PERSONAGEM_FALSO },
      caminhoPorId: CAMINHO_PERSONAGEM_POR_ID_FALSO,
      cenarios: { [CENARIO_FALSO.id]: CENARIO_FALSO, [CENARIO_SUBSOLO_FALSO.id]: CENARIO_SUBSOLO_FALSO },
      caminhoCenarioPorId: CAMINHO_CENARIO_POR_ID_FALSO,
      tree: ARVORE_FALSA,
      repo: null,
    })
  }, [])

  function aoMudarAcervoCenario(atualizador: AtualizadorAcervo) {
    setAcervoCenario((atual) => (typeof atualizador === 'function' ? atualizador(atual) : atualizador))
  }

  function aoMudarAcervoPersonagem(atualizador: AtualizadorAcervo) {
    setAcervoPersonagem((atual) => (typeof atualizador === 'function' ? atualizador(atual) : atualizador))
  }

  const nomeAberto = itemAbertoId ? ITENS_FALSOS.find((i) => i.id === itemAbertoId)?.nome : null

  return (
    <div className="amostra-cena amostra-cena-ficha">
      <h1>Ficha — Barra de localização e acervo</h1>
      <p className="amostra-legenda">
        Componentes reais das três fichas, alimentados por uma árvore de cofre falsa em memória (sem cofre, sem
        Tauri). "Mover para pasta…"/"Transformar em versão de…" abrem o seletor de verdade, mas não gravam nada
        (repositório é <code>null</code> na bancada) — teste a gravação de verdade dentro do app.
      </p>

      <h2>Ficha de cenário</h2>
      <div className="amostra-caixa">
        <BarraLocalizacao tipo="cenario" id={CENARIO_FALSO.id} />
        <p className="amostra-nota">Ficha de "{CENARIO_FALSO.nome}" — cenário com um sub-cenário (Subsolo).</p>
        <AcervoCenario acervo={acervoCenario} onChange={aoMudarAcervoCenario} />
      </div>

      <h2>Ficha de personagem</h2>
      <div className="amostra-caixa">
        <BarraLocalizacao tipo="personagem" id={PERSONAGEM_FALSO.id} />
        <p className="amostra-nota">
          Inventário de "{PERSONAGEM_FALSO.nome}" — mesma <code>AcervoCenario</code> que a aba "Itens" do{' '}
          <code>PerfilModal</code> usa.
        </p>
        <AcervoCenario className="inventario-acervo-cheio" acervo={acervoPersonagem} onChange={aoMudarAcervoPersonagem} />
      </div>

      <h2>Ficha de item</h2>
      <div className="amostra-caixa">
        <BarraLocalizacao tipo="item" id={ITENS_FALSOS[0].id} />
        <p className="amostra-nota">Ficha de "{ITENS_FALSOS[0].nome}" — pasta "Armas e Relíquias", sem sub-pastas.</p>
      </div>

      <h2>Acervo (pasta sem <code>pasta.json</code>)</h2>
      <p className="amostra-legenda">
        "Personagens soltos › sem-pasta-json" na árvore falsa não tem <code>id</code> — simula uma pasta legada sem
        <code>pasta.json</code> no disco, cujo nome cai no fallback do slug (ver <code>ARVORE_FALSA</code> em{' '}
        <code>dadosFalsos.ts</code>).
      </p>

      {nomeAberto && (
        <p className="amostra-nota">
          <code>abrirItem</code> foi chamado para “{nomeAberto}” — nesta bancada não há <code>ItemModal</code>{' '}
          montado, então nada abre na tela (no-op esperado fora do app real).
        </p>
      )}
    </div>
  )
}

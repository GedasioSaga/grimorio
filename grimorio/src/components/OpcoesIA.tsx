import { useEffect, useState } from 'react'
import { lerChaves, salvarChaves } from '../lib/chavesIA'
import { listarModelos } from '../lib/gemini'
import { MODELO_MAPA_PADRAO } from '../lib/gerarMapaIA'
import { JANELAS, JANELA_PADRAO, janelaSalva, salvarJanela } from '../lib/chatIA'
import {
  modeloMapaSalvo,
  modeloSalvo,
  montarOpcoes,
  salvarModelo,
  salvarModeloMapa,
  type Faixa,
  type OpcaoModelo,
} from '../lib/modeloIA'
import { pedirTexto } from './dialogos'

const ETIQUETA: Record<Faixa, string> = {
  barato: '💲 barato',
  medio: '💲💲 médio',
  caro: '💲💲💲 caro',
}

function rotuloJanela(n: number): string {
  return n === 0 ? 'Conversa inteira' : `Últimas ${n} mensagens`
}

/** Aba IA: chaves do Gemini, modelo e tamanho da janela de contexto. */
export function OpcoesIA() {
  const [chaves, setChaves] = useState<string[]>(() => lerChaves())
  const [modelo, setModelo] = useState<string>(() => modeloSalvo())
  // efetivo, não bruto: "Automático" e o modelo padrão explicitamente escolhido resolvem
  // para o mesmo id (MODELO_MAPA_PADRAO), então a tela trata os dois como o mesmo estado.
  const [modeloMapa, setModeloMapa] = useState<string>(() => modeloMapaSalvo() ?? MODELO_MAPA_PADRAO)
  const [janela, setJanela] = useState<number>(() => janelaSalva())
  const [opcoes, setOpcoes] = useState<OpcaoModelo[]>(() => montarOpcoes([]))
  const [consultando, setConsultando] = useState(false)

  // Pergunta à própria API o que esta chave enxerga. Sem isso a lista seria uma constante
  // no código: modelo aposentado continuaria oferecido (e dá 404 na hora do uso) e modelo
  // novo só apareceria com um release novo. Falhar aqui é inofensivo — cai na lista curada.
  useEffect(() => {
    if (chaves.length === 0) return
    let ativo = true
    setConsultando(true)
    listarModelos(chaves)
      .then((ids) => { if (ativo) setOpcoes(montarOpcoes(ids)) })
      .finally(() => { if (ativo) setConsultando(false) })
    return () => { ativo = false }
  }, [chaves])

  async function alterar() {
    // pedirTexto devolve null para vazio, então limpar tem botão próprio
    const raw = await pedirTexto(
      'Cole sua chave da API do Gemini (várias separadas por vírgula):',
      chaves.join(', '),
      'Salvar',
    )
    if (raw === null) return
    salvarChaves(raw)
    setChaves(lerChaves())
  }

  function limpar() {
    salvarChaves('')
    setChaves([])
  }

  function escolherModelo(id: string) {
    salvarModelo(id)
    setModelo(id)
  }

  function escolherModeloMapa(id: string) {
    salvarModeloMapa(id, MODELO_MAPA_PADRAO)
    setModeloMapa(id)
  }

  function escolherJanela(n: number) {
    salvarJanela(n)
    setJanela(n)
  }

  // o modelo salvo pode não estar na lista (chave trocada, modelo aposentado): mostrar
  // uma lista onde nada está marcado esconderia o problema em vez de contá-lo
  const modeloForaDaLista = opcoes.length > 0 && !opcoes.some((o) => o.id === modelo)
  const modeloMapaForaDaLista =
    opcoes.length > 0 && modeloMapa !== MODELO_MAPA_PADRAO && !opcoes.some((o) => o.id === modeloMapa)

  return (
    <>
      <div className="opcoes-secao">
        <h3>Gemini</h3>
        <p className="opcoes-vazio">
          {chaves.length === 0
            ? 'Nenhuma chave salva. O Grimório pede uma na primeira vez que você usar a IA.'
            : `${chaves.length} ${chaves.length === 1 ? 'chave salva' : 'chaves salvas'} nesta máquina.`}
        </p>
        <button className="opcoes-acao" onClick={alterar}>Alterar chaves</button>
        {chaves.length > 0 && <button className="opcoes-acao" onClick={limpar}>Remover chaves salvas</button>}
      </div>

      <div className="opcoes-secao">
        <h3>Modelo</h3>
        <p className="opcoes-vazio">
          Do mais barato ao mais caro. Barato responde rápido e serve para pergunta de mesa;
          caro escreve muito melhor descrição longa e lore.
          {consultando && ' Conferindo o que sua chave enxerga…'}
        </p>
        {modeloForaDaLista && (
          <p className="opcoes-aviso">
            O modelo salvo (<code>{modelo}</code>) não aparece para esta chave. Escolha outro abaixo,
            ou a IA vai falhar na hora do uso.
          </p>
        )}
        <div className="opcoes-modelos">
          {opcoes.map((o) => (
            <button
              key={o.id}
              className={`opcao-modelo${modelo === o.id ? ' ativa' : ''}`}
              aria-pressed={modelo === o.id}
              onClick={() => escolherModelo(o.id)}
            >
              <span className="opcao-modelo-topo">
                <span className="opcao-modelo-nome">{o.rotulo}</span>
                <span className="opcao-modelo-faixa">{ETIQUETA[o.faixa]}</span>
              </span>
              <span className="opcao-modelo-nota">{o.nota}</span>
              {!o.conhecido && <span className="opcao-modelo-id">{o.id}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="opcoes-secao">
        <h3>Modelo do mapa</h3>
        <p className="opcoes-vazio">
          Escolha SEPARADA da de cima — esta só vale para "IA monta o mapa", nunca para o chat.
          Planta é raciocínio espacial: um modelo barato costuma devolver cômodos soltos, sem
          parede em comum. Por isso o padrão é o mais capaz; troque aqui só se quiser testar
          outro.
          {consultando && ' Conferindo o que sua chave enxerga…'}
        </p>
        {modeloMapaForaDaLista && (
          <p className="opcoes-aviso">
            O modelo do mapa salvo (<code>{modeloMapa}</code>) não aparece para esta chave. Escolha
            outro abaixo, ou a montagem do mapa vai falhar na hora do uso.
          </p>
        )}
        <div className="opcoes-modelos">
          <button
            className={`opcao-modelo${modeloMapa === MODELO_MAPA_PADRAO ? ' ativa' : ''}`}
            aria-pressed={modeloMapa === MODELO_MAPA_PADRAO}
            onClick={() => escolherModeloMapa(MODELO_MAPA_PADRAO)}
          >
            <span className="opcao-modelo-topo">
              <span className="opcao-modelo-nome">Automático (o mais capaz)</span>
            </span>
            <span className="opcao-modelo-nota">
              Deixa o Grimório escolher o modelo mais forte disponível para montar a planta.
            </span>
          </button>
          {opcoes.map((o) => (
            <button
              key={o.id}
              className={`opcao-modelo${modeloMapa === o.id ? ' ativa' : ''}`}
              aria-pressed={modeloMapa === o.id}
              onClick={() => escolherModeloMapa(o.id)}
            >
              <span className="opcao-modelo-topo">
                <span className="opcao-modelo-nome">{o.rotulo}</span>
                <span className="opcao-modelo-faixa">{ETIQUETA[o.faixa]}</span>
              </span>
              <span className="opcao-modelo-nota">{o.nota}</span>
              {!o.conhecido && <span className="opcao-modelo-id">{o.id}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="opcoes-secao">
        <h3>Memória da conversa</h3>
        <p className="opcoes-vazio">
          Quantas mensagens do fim da conversa a IA recebe junto com a pergunta. O que fica de
          fora continua na tela e no arquivo — o chat marca onde o corte acontece. Mais mensagens
          = mais coerência e conta mais cara.
        </p>
        <select
          className="opcoes-select"
          value={janela}
          onChange={(e) => escolherJanela(Number(e.target.value))}
        >
          {JANELAS.map((n) => (
            <option key={n} value={n}>
              {rotuloJanela(n)}{n === JANELA_PADRAO ? ' (padrão)' : ''}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}

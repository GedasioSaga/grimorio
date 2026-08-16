import { useEffect, useRef, useState } from 'react'
import { open, message } from '@tauri-apps/plugin-dialog'
import { useEditor } from 'tldraw'
import { useApp } from '../state/store'
import { garantirChaves } from '../lib/chavesIA'
import { pedirTexto } from './dialogos'
import { associarNaCriacao } from './dialogoCampanhas'
import {
  carregarImagemDeArquivo,
  especificacoesParaMapaNovo,
  gerarPlantaIA,
  inserirPlantaNoMapaAberto,
} from '../lib/gerarMapaIA'
import { definirPlantaPendente } from '../lib/mapaIAPendente'

type Destino = 'aqui' | 'novo'

/**
 * Botão "IA monta o mapa" da toolbar: pede uma descrição (e/ou imagem de referência), manda
 * pro Gemini, valida a resposta (`gerarMapaIA.ts`/`plantaMapaIA.ts`) e insere — no mapa
 * aberto ou num mapa novo, à escolha do usuário A CADA geração (decisão 1).
 *
 * O pedido inteiro (descrição + imagem + destino) é reunido ANTES de chamar a IA: pedir o
 * destino só depois complicaria o caminho de erro (a IA falhou, mas o mapa novo já existe
 * vazio?) sem ganhar nada — o usuário já sabe onde quer a planta antes de descrevê-la.
 */
export function AcoesMapaIA() {
  const editor = useEditor()
  const repo = useApp((s) => s.repo)
  const recarregar = useApp((s) => s.recarregarArvore)
  const abrirDocumento = useApp((s) => s.abrirDocumento)

  const [dialogoAberto, setDialogoAberto] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [imagemCaminho, setImagemCaminho] = useState<string | null>(null)
  const [destino, setDestino] = useState<Destino>('aqui')
  const [nomeNovoMapa, setNomeNovoMapa] = useState('')
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<string | null>(null)
  const montadoRef = useRef(true)

  useEffect(() => {
    // re-arma no setup (mesmo motivo do AcoesIA): o StrictMode roda cleanup+setup extras
    // mantendo os refs — sem isso montadoRef ficaria false pra sempre e nenhum "if
    // (montadoRef.current)" adiante faria efeito nenhum.
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  function abrirDialogo() {
    setErro(null)
    setResumo(null)
    setDialogoAberto(true)
  }

  function fecharDialogo() {
    if (rodando) return
    setDialogoAberto(false)
  }

  async function escolherImagem() {
    const arquivo = await open({
      title: 'Imagem de referência',
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    })
    if (typeof arquivo === 'string') setImagemCaminho(arquivo)
  }

  /**
   * Aviso de erro que funciona MESMO se o componente já desmontou. `setErro` não adianta
   * nesse caso — o diálogo que o mostraria já se foi junto com o mapa que o usuário
   * trocou. O diálogo nativo do Tauri não depende da árvore React continuar viva, então é
   * ele (e só ele) quem garante "nunca falha calado" depois que a IA responde tarde.
   */
  async function avisar(texto: string, erro: boolean) {
    if (montadoRef.current) {
      if (erro) setErro(texto)
      return
    }
    await message(texto, { title: 'Grimório', kind: erro ? 'error' : 'warning' })
  }

  async function gerar() {
    const texto = descricao.trim()
    if (!texto && !imagemCaminho) return
    if (destino === 'novo' && !nomeNovoMapa.trim()) return

    setErro(null)
    setRodando(true)
    try {
      const chaves = await garantirChaves(pedirTexto)
      if (chaves.length === 0) {
        await avisar('IA não configurada. Cole sua chave da API do Gemini quando solicitado.', true)
        return
      }
      let imagem
      if (imagemCaminho) {
        imagem = await carregarImagemDeArquivo(imagemCaminho)
        if (!imagem) {
          await avisar('Não foi possível ler a imagem anexada. Escolha outro arquivo ou remova o anexo.', true)
          return
        }
      }
      // sem `modelo`: `gerarPlantaIA` usa o padrão FORTE fixo para mapa (`MODELO_MAPA_PADRAO`
      // em gerarMapaIA.ts), independente do modelo escolhido para texto — ver o porquê lá.
      const resultado = await gerarPlantaIA({ descricao: texto, imagem, chaves })
      if (!resultado.ok) {
        await avisar(resultado.erro, true)
        return
      }

      if (destino === 'aqui') {
        /**
         * A espera pela IA é a janela em que o usuário pode trocar de mapa: `rodando`
         * trava só o diálogo, não a navegação. Trocar desmonta `MapaView`/`AcoesMapaIA`
         * (o `editor` daqui vira um cadáver — `useDocumentoTldraw` já deu `unlisten()` no
         * store) e SEM checar isso a inserção rodaria num editor morto: ou lança sem
         * ninguém pra ver o catch, ou cria shapes num store que ninguém mais autosalva —
         * a planta some sem erro nenhum na tela. `editor.isDisposed` é o campo público
         * que o próprio tldraw vira `true` em `dispose()` (Editor.ts:1013-1017).
         */
        if (editor.isDisposed) {
          await avisar(
            `Você trocou de mapa antes de a IA terminar — a planta não foi inserida.\n\n${resultado.resumo}`,
            false,
          )
          return
        }
        inserirPlantaNoMapaAberto(editor, resultado.planta)
      } else {
        if (!repo) throw new Error('cofre não carregado')
        const nome = nomeNovoMapa.trim()
        const ref = await repo.criarCanvasDoc('mapas-soltos', nome)
        // registra a planta e abre o mapa ANTES de qualquer passo que possa lançar: se
        // associar à campanha ou recarregar a árvore falhar depois disto, o mapa já
        // existe preenchido e aberto — não um arquivo vazio órfão com a planta perdida.
        definirPlantaPendente(ref.caminho, especificacoesParaMapaNovo(resultado.planta))
        abrirDocumento('mapa', ref.caminho, nome)
        try {
          await associarNaCriacao('canvas', ref.id, nome)
        } catch (e) {
          console.warn('Mapa criado pela IA: falha ao associar a uma campanha (não crítico):', e)
        }
        try {
          await recarregar()
        } catch (e) {
          console.warn('Mapa criado pela IA: falha ao atualizar a árvore da sidebar (não crítico):', e)
        }
      }

      if (montadoRef.current) {
        setResumo(resultado.resumo)
        setDescricao('')
        setImagemCaminho(null)
        setNomeNovoMapa('')
        setDialogoAberto(false)
      }
    } catch (e) {
      await avisar(e instanceof Error ? e.message : String(e), true)
    } finally {
      if (montadoRef.current) setRodando(false)
    }
  }

  return (
    <>
      <button type="button" className="btn-icon" title="IA monta o mapa" onClick={abrirDialogo}>
        🪄
      </button>
      {resumo && (
        <div className="mapa-ia-resumo" onClick={() => setResumo(null)}>
          {resumo}
        </div>
      )}
      {dialogoAberto && (
        <div className="modal-overlay" onClick={fecharDialogo}>
          <div className="dialogo-caixa mapa-ia-caixa" onClick={(e) => e.stopPropagation()}>
            <label className="dialogo-titulo">IA monta o mapa</label>
            <textarea
              className="mapa-ia-descricao"
              placeholder="Descreva o mapa: 'castelo de 3 andares, salão central, torre ao norte, masmorra embaixo'…"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={rodando}
            />
            <div className="mapa-ia-imagem">
              <button type="button" disabled={rodando} onClick={() => void escolherImagem()}>
                📎 Anexar imagem de referência
              </button>
              {imagemCaminho && (
                <span className="mapa-ia-imagem-chip">
                  {imagemCaminho.split(/[\\/]/).pop()}
                  <button type="button" title="Remover imagem" disabled={rodando} onClick={() => setImagemCaminho(null)}>
                    ×
                  </button>
                </span>
              )}
            </div>
            <div className="mapa-ia-destino">
              <label>
                <input type="radio" name="mapa-ia-destino" checked={destino === 'aqui'} disabled={rodando} onChange={() => setDestino('aqui')} />
                Inserir no mapa aberto
              </label>
              <label>
                <input type="radio" name="mapa-ia-destino" checked={destino === 'novo'} disabled={rodando} onChange={() => setDestino('novo')} />
                Criar mapa novo
              </label>
            </div>
            {destino === 'novo' && (
              <input
                className="dialogo-input"
                placeholder="Nome do mapa novo"
                value={nomeNovoMapa}
                onChange={(e) => setNomeNovoMapa(e.target.value)}
                disabled={rodando}
              />
            )}
            {erro && <div className="mapa-ia-erro">{erro}</div>}
            <div className="dialogo-botoes">
              <button disabled={rodando} onClick={fecharDialogo}>Cancelar</button>
              <button
                className="dialogo-ok"
                disabled={rodando || (!descricao.trim() && !imagemCaminho) || (destino === 'novo' && !nomeNovoMapa.trim())}
                onClick={() => void gerar()}
              >
                {rodando ? 'Gerando…' : 'Gerar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

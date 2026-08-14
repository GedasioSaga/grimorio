import { useEffect, useRef, useState } from 'react'
import {
  createTLStore,
  getSnapshot,
  loadSnapshot,
  uniqueId,
  type TLAnyShapeUtilConstructor,
  type TLAssetStore,
  type TLEditorSnapshot,
  type TLStore,
} from 'tldraw'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import type { VaultRepo } from '../lib/vaultRepo'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { uint8ParaBase64 } from '../lib/bin'

const AUTOSAVE_DEBOUNCE_MS = 1000

/**
 * Asset store do tldraw: imagens coladas/arrastadas vão para `<cofre>/imagens-canvas/`.
 * O snapshot guarda só o caminho RELATIVO em `meta.rel`; `resolve()` remonta a URL
 * a partir do vaultPath atual — o cofre continua portátil entre máquinas.
 */
function criarAssetStore(vaultPath: string, repo: VaultRepo): TLAssetStore {
  return {
    async upload(_asset, file) {
      const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'png').toLowerCase()
      const rel = `imagens-canvas/${uniqueId()}.${ext}`
      const bytes = new Uint8Array(await file.arrayBuffer())
      await repo.escreverBinario(rel, uint8ParaBase64(bytes))
      return { src: convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)), meta: { rel } }
    },
    resolve(asset) {
      const rel = (asset.meta as { rel?: string } | undefined)?.rel
      return rel ? convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)) : asset.props.src
    },
  }
}

/** Ponto único de criação do store do tldraw. */
function criarStoreCanvas(vaultPath: string, repo: VaultRepo, shapeUtils: TLAnyShapeUtilConstructor[]): TLStore {
  return createTLStore({
    shapeUtils,
    assets: criarAssetStore(vaultPath, repo),
  })
}

/**
 * Ciclo de vida de um documento tldraw persistido no cofre (canvas, sessão, mapa):
 * carrega o snapshot, autosalva com debounce, salva pendência no unmount e relê o
 * arquivo quando o sync escreve no cofre (`recargasDoDisco`). Extraído do CanvasView
 * para o MapaView reusar sem duplicar a parte que conversa com sync/persistência.
 *
 * `shapeUtils` entra por parâmetro porque cada view registra os seus; o chamador
 * DEVE passar um array de identidade estável (constante de módulo), senão o efeito
 * de carga remonta o store a cada render.
 */
export function useDocumentoTldraw(
  caminho: string,
  shapeUtils: TLAnyShapeUtilConstructor[],
): {
  store: TLStore | null
  erro: string | null
  salvandoErro: string | null
} {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const recargasDoDisco = useApp((s) => s.recargasDoDisco)
  const [store, setStore] = useState<TLStore | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvandoErro, setSalvandoErro] = useState<string | null>(null)
  // Ref e não `let` do efeito: o efeito de releitura precisa saber se há gravação pendente.
  const timerAutosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Valor do mount, para a releitura ignorar a primeira rodada do efeito (o load inicial já leu).
  const recargasVistasRef = useRef(recargasDoDisco)

  // carrega o snapshot do arquivo e monta o store
  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!repo || !vaultPath) return
      try {
        const doc = await repo.lerCanvasDoc(caminho)
        if (!ativo) return
        const s = criarStoreCanvas(vaultPath, repo, shapeUtils)
        if (doc.documento) loadSnapshot(s, doc.documento as Partial<TLEditorSnapshot>)
        setStore(s)
      } catch (e) {
        if (ativo) setErro(String(e))
      }
    }
    carregar()
    return () => {
      ativo = false
    }
  }, [repo, vaultPath, caminho, shapeUtils])

  // autosave com debounce; descarrega gravação pendente ao desmontar
  useEffect(() => {
    if (!store || !repo) return
    const storeAtual = store
    const repoAtual = repo

    async function salvar() {
      const { document, session } = getSnapshot(storeAtual)
      try {
        await repoAtual.salvarDocumentoCanvas(caminho, { document, session })
        setSalvandoErro(null)
      } catch (e) {
        setSalvandoErro(String(e))
      }
    }

    const unlisten = store.listen(
      () => {
        if (timerAutosaveRef.current) clearTimeout(timerAutosaveRef.current)
        timerAutosaveRef.current = setTimeout(() => {
          timerAutosaveRef.current = null
          void salvar()
        }, AUTOSAVE_DEBOUNCE_MS)
      },
      { scope: 'document', source: 'user' },
    )

    return () => {
      unlisten()
      if (timerAutosaveRef.current) {
        // havia gravação pendente: cancela o debounce e grava já.
        // VaultRepo serializa escritas por caminho, então fire-and-forget é seguro.
        clearTimeout(timerAutosaveRef.current)
        timerAutosaveRef.current = null
        salvar().catch((e) => console.error('Falha no save final do canvas:', e))
      }
    }
  }, [store, repo, caminho])

  /**
   * Relê o arquivo quando o sync escreveu no cofre (`recargasDoDisco` subiu). O snapshot vive
   * num store do tldraw que `recarregarDoDisco` não alcança: sem isto, o canvas aberto continua
   * mostrando o retrato de antes do download, e a PRÓXIMA edição grava esse retrato velho por
   * cima do arquivo baixado — divergência real, que vira cópia de conflito.
   *
   * Com autosave pendente a releitura é pulada: a edição do usuário ainda não chegou ao disco,
   * e reler agora a descartaria. Local vence — a mesma escolha de `recarregarDoDisco` para as
   * entidades, e o motor de sync trata a divergência honestamente no ciclo seguinte.
   *
   * `mergeRemoteChanges` marca a carga como `source: 'remote'`: o listener do autosave (acima,
   * `source: 'user'`) não dispara, senão cada releitura regravaria o arquivo recém-baixado.
   */
  useEffect(() => {
    if (recargasDoDisco === recargasVistasRef.current) return
    recargasVistasRef.current = recargasDoDisco
    if (!store || !repo || timerAutosaveRef.current !== null) return
    const storeAtual = store
    let ativo = true
    repo
      .lerCanvasDoc(caminho)
      .then((doc) => {
        if (!ativo || !doc.documento) return
        storeAtual.mergeRemoteChanges(() => {
          loadSnapshot(storeAtual, doc.documento as Partial<TLEditorSnapshot>)
        })
      })
      .catch((e) => console.warn('Canvas: o cofre mudou no disco mas não deu para reler:', e))
    return () => {
      ativo = false
    }
  }, [recargasDoDisco, store, repo, caminho])

  return { store, erro, salvandoErro }
}

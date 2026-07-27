import { invoke } from '@tauri-apps/api/core'

/**
 * Ponte fina para o cliente do Drive que vive no Rust (`src-tauri/src/drive.rs`), no mesmo
 * formato de `googleAuth.ts`: nenhuma regra mora aqui.
 *
 * O cliente é Rust — e não TypeScript sobre o `plugin-http` — para que o access token não
 * precise atravessar a ponte a cada operação. O que cruza é só id, caminho, hash e tamanho.
 *
 * Duas convenções da API do Tauri estão embutidas nos nomes e não podem ser mexidas sem
 * quebrar as chamadas em tempo de execução (nenhum teste pega isso, porque o teste usa um
 * cliente falso):
 *
 * 1. **Os argumentos vão em camelCase.** O Tauri converte `pastaMaeId` para o `pasta_mae_id`
 *    do Rust sozinho; mandar snake_case daqui faz o comando reclamar de argumento faltando.
 * 2. **`Option<T>` do Rust chega e sai como `null`**, nunca `undefined` — daí `string | null`
 *    em todo campo opcional, e não `string | undefined`.
 */

/** Um arquivo do cofre no Drive, com o caminho relativo já reconstruído pelo Rust. */
export interface ItemRemoto {
  caminho: string
  fileId: string
  /** `sha256Checksum`. Ausente em arquivo que o Drive não soube somar. */
  hash: string | null
  versao: string
  tamanho: number | null
  modificadoEm: string | null
  /** De qual computador veio esta versão, para assinar a cópia de conflito. */
  deviceNome: string | null
}

export interface PastaRemota {
  caminho: string
  fileId: string
}

export interface ConteudoRemoto {
  pastas: PastaRemota[]
  arquivos: ItemRemoto[]
}

/** `fileId: null` cria um arquivo novo; um id substitui o conteúdo do que já existe. */
export interface PedidoEnvio {
  pastaId: string
  nome: string
  caminhoLocal: string
  fileId: string | null
  deviceNome: string
}

export interface ArquivoEnviado {
  fileId: string
  hash: string | null
  versao: string
  tamanho: number | null
}

/**
 * O cliente do Drive como INTERFACE, e não como funções soltas importadas direto.
 *
 * É o que permite ao executor rodar contra um cliente falso — do mesmo jeito que `FsBridge`
 * é trocado por `criarFakeFs` nos testes. Sem isso, a única forma de testar o executor seria
 * com credencial real e rede, e a metade mais perigosa do sync (o que fazer quando uma ação
 * falha no meio do plano) ficaria sem teste nenhum.
 */
export interface ClienteDrive {
  pastaRaiz(): Promise<string>
  garantirPasta(pastaMaeId: string, caminho: string): Promise<string>
  listar(pastaRaizId: string): Promise<ConteudoRemoto>
  enviar(pedido: PedidoEnvio): Promise<ArquivoEnviado>
  baixar(fileId: string, caminhoLocal: string): Promise<void>
  /** Manda para a lixeira do Drive, recuperável por 30 dias. Não apaga de vez. */
  apagar(fileId: string): Promise<void>
}

export const tauriDrive: ClienteDrive = {
  pastaRaiz: () => invoke('drive_pasta_raiz'),
  garantirPasta: (pastaMaeId, caminho) => invoke('drive_garantir_pasta', { pastaMaeId, caminho }),
  listar: (pastaRaizId) => invoke('drive_listar', { pastaRaizId }),
  enviar: (pedido) => invoke('drive_enviar', { pedido }),
  baixar: (fileId, caminhoLocal) => invoke('drive_baixar', { fileId, caminhoLocal }),
  apagar: (fileId) => invoke('drive_apagar', { fileId }),
}

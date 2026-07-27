import { invoke } from '@tauri-apps/api/core'

/**
 * Uma entrada de diretório, na forma que `list_dir` (`src-tauri/src/lib.rs`) devolve.
 *
 * `size` e `mtime` existem para a varredura de sync poder PULAR o hash de arquivo que não mudou
 * — sem eles cada ciclo releria dezenas de MB de imagem. Chegam `null` quando o sistema não
 * deixou ler o metadado (antivírus segurando o arquivo, permissão negada, link quebrado): a
 * entrada continua na lista, porque derrubar a listagem inteira por causa de um arquivo travado
 * apagaria a árvore de personagens da tela e faria a varredura ler o cofre como esvaziado.
 */
export interface EntradaDeDiretorio {
  name: string
  isDir: boolean
  /** Em bytes. */
  size: number | null
  /** Epoch em milissegundos, a mesma unidade de `EntradaArquivo.mtimeLocal`. */
  mtime: number | null
}

export interface FsBridge {
  readText(path: string): Promise<string>
  writeTextAtomic(path: string, content: string): Promise<void>
  writeBinaryBase64(path: string, base64: string): Promise<void>
  listDir(path: string): Promise<EntradaDeDiretorio[]>
  mkdirAll(path: string): Promise<void>
  removePath(path: string): Promise<void>
  copyFile(from: string, to: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  exists(path: string): Promise<boolean>
}

export const tauriFs: FsBridge = {
  readText: (path) => invoke('read_text_file', { path }),
  writeTextAtomic: (path, content) => invoke('write_text_file_atomic', { path, content }),
  writeBinaryBase64: (path, base64) => invoke('write_binary_base64', { path, base64 }),
  listDir: async (path) => {
    type Bruta = { name: string; is_dir: boolean; size: number | null; mtime: number | null }
    const entries = await invoke<Bruta[]>('list_dir', { path })
    return entries.map((e) => ({ name: e.name, isDir: e.is_dir, size: e.size, mtime: e.mtime }))
  },
  mkdirAll: (path) => invoke('mkdir_all', { path }),
  removePath: (path) => invoke('remove_path', { path }),
  copyFile: (from, to) => invoke('copy_file', { from, to }),
  rename: (from, to) => invoke('rename_path', { from, to }),
  exists: (path) => invoke('path_exists', { path }),
}

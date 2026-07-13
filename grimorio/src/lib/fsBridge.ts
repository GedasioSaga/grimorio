import { invoke } from '@tauri-apps/api/core'

export interface FsBridge {
  readText(path: string): Promise<string>
  writeTextAtomic(path: string, content: string): Promise<void>
  writeBinaryBase64(path: string, base64: string): Promise<void>
  listDir(path: string): Promise<{ name: string; isDir: boolean }[]>
  mkdirAll(path: string): Promise<void>
  removePath(path: string): Promise<void>
  copyFile(from: string, to: string): Promise<void>
  exists(path: string): Promise<boolean>
}

export const tauriFs: FsBridge = {
  readText: (path) => invoke('read_text_file', { path }),
  writeTextAtomic: (path, content) => invoke('write_text_file_atomic', { path, content }),
  writeBinaryBase64: (path, base64) => invoke('write_binary_base64', { path, base64 }),
  listDir: async (path) => {
    const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_dir', { path })
    return entries.map((e) => ({ name: e.name, isDir: e.is_dir }))
  },
  mkdirAll: (path) => invoke('mkdir_all', { path }),
  removePath: (path) => invoke('remove_path', { path }),
  copyFile: (from, to) => invoke('copy_file', { from, to }),
  exists: (path) => invoke('path_exists', { path }),
}

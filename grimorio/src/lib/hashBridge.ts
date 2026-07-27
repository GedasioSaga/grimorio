import { invoke } from '@tauri-apps/api/core'

/**
 * Ponte fina para os comandos de hash que vivem no Rust (`src-tauri/src/hash.rs`).
 *
 * Nenhuma regra mora aqui de propósito. O hash é do Rust porque a varredura de sync compara
 * dezenas de MB de imagem a cada ciclo, e somar esses bytes no JavaScript significaria
 * atravessar a ponte com o arquivo inteiro na mão, arquivo por arquivo, para chegar ao mesmo
 * número. Os nomes são os que o `generate_handler!` registrou — o Tauri os deriva do nome da
 * função, não do caminho do módulo — e os argumentos vão em camelCase, que o Tauri converte
 * para o snake_case do Rust sozinho.
 */

/** SHA-256 hex de um arquivo, lido em blocos. Arquivo travado ou sumido faz a promessa rejeitar. */
export function hashArquivo(caminhoAbsoluto: string): Promise<string> {
  return invoke<string>('hash_arquivo', { path: caminhoAbsoluto })
}

/** SHA-256 hex truncado em 16 caracteres. Identidade estável do cofre, não defesa contra colisão. */
export function hashTexto(texto: string): Promise<string> {
  return invoke<string>('hash_texto', { texto })
}

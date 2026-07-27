import { invoke } from '@tauri-apps/api/core'

/**
 * Ponte fina para os comandos de OAuth que vivem no Rust (`src-tauri/src/auth.rs`).
 *
 * Nenhuma regra mora aqui de propósito: o Rust é dono das credenciais, e o refresh token
 * nunca atravessa para este lado. Os nomes são os que o `generate_handler!` registrou —
 * o Tauri os deriva do nome da função, não do caminho do módulo.
 */

/** Abre o navegador, espera o usuário concluir e devolve o e-mail da conta conectada. */
export function googleIniciarLogin(): Promise<string> {
  return invoke<string>('google_iniciar_login')
}

/** Access token de vida curta, para falar com a API do Drive. Nunca deve chegar à tela. */
export function googleAccessToken(): Promise<string> {
  return invoke<string>('google_access_token')
}

/** E-mail da conta conectada. `Option::None` do Rust chega aqui como `null`, não `undefined`. */
export function googleConta(): Promise<string | null> {
  return invoke<string | null>('google_conta')
}

/** Esquece a conta guardada nesta máquina. É idempotente do lado do Rust. */
export function googleDesconectar(): Promise<void> {
  return invoke<void>('google_desconectar')
}

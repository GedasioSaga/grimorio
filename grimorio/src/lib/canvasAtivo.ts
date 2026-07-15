import type { Editor } from 'tldraw'

/**
 * Registro do editor tldraw da view aberta (singleton de módulo): o ChatIA
 * consulta o card selecionado sem acoplar o Workspace ao CanvasView.
 */
let atual: Editor | null = null

export function registrarEditor(e: Editor): void {
  atual = e
}

/** Desregistra só se ainda for o mesmo (troca de view registra o novo antes do cleanup do velho). */
export function desregistrarEditor(e: Editor): void {
  if (atual === e) atual = null
}

export function editorAtivo(): Editor | null {
  return atual
}

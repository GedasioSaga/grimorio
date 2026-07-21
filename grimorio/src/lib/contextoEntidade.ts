/**
 * Texto que descreve uma entidade (personagem/cenário) para o chat de IA escopado:
 * a versão ATIVA em texto plano. Lógica pura (sem UI/store/Tauri) — a camada de
 * componentes injeta a entidade; aqui só formatamos. Testável sem DOM.
 */
import type { Cenario, Personagem } from './types'
import { versaoAtivaPersonagem } from './personagemVersao'
import { versaoAtiva } from './cenarioVersao'
import { htmlParaTexto, temConteudo } from './htmlTexto'

export type TipoEntidade = 'personagem' | 'cenario'

/** Persona do assistente para o chat de uma entidade específica. */
export function SYSTEM_ENTIDADE(tipo: TipoEntidade): string {
  const alvo = tipo === 'personagem' ? 'personagem' : 'cenário'
  return [
    `Você é um assistente criativo ajudando o autor a desenvolver um ${alvo} específico da história dele, em português do Brasil.`,
    `Use as informações fornecidas sobre o ${alvo} como verdade estabelecida; nunca contradiga esses fatos.`,
    `Pode sugerir ideias, aprofundar detalhes, apontar inconsistências e responder perguntas sobre o ${alvo}.`,
    'Respostas diretas e úteis; expanda só quando fizer sentido.',
  ].join(' ')
}

/** Cabeçalho (+ resumo, se houver) seguido das abas com conteúdo. */
function montar(cabecalho: string, resumo: string, campos: [rotulo: string, html: string][]): string {
  const partes: string[] = [resumo.trim() ? `${cabecalho}\nResumo: ${resumo.trim()}` : cabecalho]
  for (const [rotulo, html] of campos) {
    if (temConteudo(html)) partes.push(`## ${rotulo}\n${htmlParaTexto(html)}`)
  }
  return partes.join('\n\n')
}

/** Versão ativa da entidade em texto plano (nome, resumo e todas as abas com conteúdo). */
export function textoDaEntidade(ent: Personagem | Cenario, tipo: TipoEntidade): string {
  if (tipo === 'personagem') {
    const v = versaoAtivaPersonagem(ent as Personagem)
    return montar(`# Personagem: ${v.nome}`, v.resumo, [
      ['Descrição', v.descricao],
      ['Informações', v.informacao],
      ['História', v.historia],
      ['Extras', v.extras],
      ['Anotações', v.anotacoes],
    ])
  }
  const c = ent as Cenario
  const v = versaoAtiva(c)
  return montar(`# Cenário: ${c.nome} — versão ${v.nome}`, v.resumo, [
    ['Descrição', v.descricao],
    ['Informações', v.informacao],
    ['História', v.historia],
    ['Eventos', v.eventos],
    ['Itens', v.itens],
    ['Anotações', v.anotacoes],
  ])
}

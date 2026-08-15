import { atom, computed, createTLUser, getUserPreferences, setUserPreferences, type TLUser } from 'tldraw'

/**
 * `TLUser` exclusivo do Mapa: o encaixe (snap) das guias já vem LIGADO lá, e ligar ou
 * desligar não contamina o Canvas nem fica gravado no disco.
 *
 * Por que não o caminho óbvio — `editor.user.updateUserPreferences({ isSnapMode: true })`
 * no `onMount`, que a Task D do plano mandava VERIFICAR antes de usar: sem a prop
 * `user`, todo `<Tldraw>` cai no MESMO objeto de preferências, o `computed` de módulo
 * `defaultLocalStorageUserPrefs` (node_modules/@tldraw/editor/src/lib/config/createTLUser.ts:14-16
 * e :27), que `setUserPreferences` grava no localStorage
 * (config/TLUserPreferences.ts:232-236). Ou seja: ligar o snap no mapa ligava junto no
 * CanvasView e PERSISTIA depois de fechar o app. Preferência global não serve para uma
 * regra que vale só numa tela.
 *
 * O mapa então recebe um `TLUser` próprio (prop `user` do `<Tldraw>`,
 * TldrawEditor.tsx:156) em que só o `isSnapMode` é local, guardado no atom desta função
 * (um por mapa aberto, começando ligado). Ele:
 * - LÊ as preferências globais e troca só o `isSnapMode` pelo valor do atom. O resto
 *   (tema, velocidade de animação, atalhos) continua compartilhado E reativo, porque
 *   `getUserPreferences()` lê o atom `globalUserPreferences` (TLUserPreferences.ts:219
 *   e :274-275) por dentro do `computed`.
 * - ESCREVE o `isSnapMode` pedido no atom local e devolve ao global o valor que já
 *   estava lá. Sem isso, a primeira gravação vinda do mapa (o `colorScheme: 'dark'` do
 *   `onMount`, por exemplo) carimbaria o valor local no disco — `updateUserPreferences`
 *   monta o objeto novo a partir de `userPreferences.get()`
 *   (managers/UserPreferencesManager/UserPreferencesManager.ts:33-38) — e o vazamento
 *   voltaria pela porta dos fundos.
 *
 * Guardar o `isSnapMode` local num atom, em vez de fixá-lo em `true`, é o que mantém
 * VIVO o item "Snap" do menu nativo (MainMenu › Preferências — `ToggleSnapModeItem`,
 * node_modules/tldraw/src/lib/ui/components/menu-items.tsx:545-549): ele lê
 * `getIsSnapMode()` e escreve por `updateUserPreferences`, os dois caminhos acima.
 * Fixar `true` deixaria o checkbox marcado para sempre, engolindo o clique sem aviso.
 *
 * Com o snap ligado, o Ctrl inverte o comportamento: passa a DESLIGAR o encaixe
 * enquanto estiver pressionado (tldraw/src/lib/tools/SelectTool/childStates/Translating.ts:502
 * — `editor.user.getIsSnapMode() ? !accelKey : accelKey`).
 */
export function criarUsuarioDoMapa(): TLUser {
  const snapDoMapa = atom('snap-do-mapa', true)

  return createTLUser({
    userPreferences: computed('preferencias-do-mapa', () => ({
      ...getUserPreferences(),
      isSnapMode: snapDoMapa.get(),
    })),
    setUserPreferences: (prefs) => {
      snapDoMapa.set(prefs.isSnapMode ?? false)
      setUserPreferences({ ...prefs, isSnapMode: getUserPreferences().isSnapMode })
    },
  })
}

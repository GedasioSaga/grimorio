import { computed, createTLUser, getUserPreferences, setUserPreferences, type TLUser } from 'tldraw'

/**
 * `TLUser` exclusivo do Mapa: o encaixe (snap) das guias fica SEMPRE ligado lá, sem
 * contaminar o Canvas nem ficar gravado no disco.
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
 * TldrawEditor.tsx:156) que:
 * - LÊ as preferências globais e sobrepõe só `isSnapMode: true`. O resto (tema,
 *   velocidade de animação, atalhos) continua compartilhado E reativo, porque
 *   `getUserPreferences()` lê o atom `globalUserPreferences`
 *   (TLUserPreferences.ts:219 e :274-275) por dentro do `computed`.
 * - ESCREVE de volta no global devolvendo o `isSnapMode` que já estava lá. Sem isso, a
 *   primeira gravação vinda do mapa (o `colorScheme: 'dark'` do `onMount`, por exemplo)
 *   carimbaria a sobreposição no disco — `updateUserPreferences` monta o objeto novo a
 *   partir de `userPreferences.get()`, que aqui já vem com `true`
 *   (managers/UserPreferencesManager/UserPreferencesManager.ts) — e o vazamento
 *   voltaria pela porta dos fundos.
 *
 * Com o snap ligado, o Ctrl inverte o comportamento: passa a DESLIGAR o encaixe
 * enquanto estiver pressionado (tldraw/src/lib/tools/SelectTool/childStates/Translating.ts:502
 * — `editor.user.getIsSnapMode() ? !accelKey : accelKey`).
 */
export function criarUsuarioDoMapa(): TLUser {
  return createTLUser({
    userPreferences: computed('preferencias-do-mapa', () => ({ ...getUserPreferences(), isSnapMode: true })),
    setUserPreferences: (prefs) => setUserPreferences({ ...prefs, isSnapMode: getUserPreferences().isSnapMode }),
  })
}

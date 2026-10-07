export type KeybindingAction = { id: string; description: string; defaults: string[]; /** Set in keybindings.json; replaces the defaults. */ keys?: string[] };
export type KeybindingsView = { path: string; revision: string; exists: boolean; hasBackup: boolean; error?: string; actions: KeybindingAction[]; unknown: string[] };

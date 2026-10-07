// Key syntax from Pi 1.0.3 docs/keybindings.md: modifiers ctrl, shift, alt and super joined with "+".
const NAMED = ["escape", "esc", "enter", "return", "tab", "space", "backspace", "delete", "insert", "clear", "home", "end", "pageUp", "pageDown", "up", "down", "left", "right"];
const SYMBOLS = "`-=[]\\;',./!@#$%^&*()_+|~{}:<>?";
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
const KEY = new RegExp(`^(?:(?:ctrl|shift|alt|super)\\+)*(?:[a-z]|[0-9]|f(?:[1-9]|1[0-2])|${NAMED.join("|")}|${[...SYMBOLS].map(escape).join("|")})$`);

export function isValidKey(key: string): boolean {
  return KEY.test(key);
}

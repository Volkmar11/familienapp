/* Zentrale Navigation, damit die Ansichten sich nicht gegenseitig importieren muessen. */
let ziel = () => {};
export function routerSetzen(f) { ziel = f; }
export function gehe(route) { return ziel(route); }

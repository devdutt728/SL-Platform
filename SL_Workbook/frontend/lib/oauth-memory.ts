type OAuthStateEntry = {
  createdAt: number;
  returnToOrigin: string;
  redirectUri: string;
};

type TokenEntry = {
  createdAt: number;
  idToken: string;
};

const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 2 * 60 * 1000;

const stateStore = new Map<string, OAuthStateEntry>();
const tokenStore = new Map<string, TokenEntry>();

function cleanup() {
  const now = Date.now();
  stateStore.forEach((value, key) => {
    if (now - value.createdAt > STATE_TTL_MS) stateStore.delete(key);
  });
  tokenStore.forEach((value, key) => {
    if (now - value.createdAt > TOKEN_TTL_MS) tokenStore.delete(key);
  });
}

export function putOAuthState(state: string, entry: Omit<OAuthStateEntry, "createdAt">) {
  cleanup();
  stateStore.set(state, { ...entry, createdAt: Date.now() });
}

export function getOAuthState(state: string) {
  cleanup();
  const entry = stateStore.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    stateStore.delete(state);
    return null;
  }
  return entry;
}

export function deleteOAuthState(state: string) {
  stateStore.delete(state);
}

export function putFinalizeToken(code: string, idToken: string) {
  cleanup();
  tokenStore.set(code, { idToken, createdAt: Date.now() });
}

export function popFinalizeToken(code: string) {
  cleanup();
  const entry = tokenStore.get(code);
  if (!entry) return null;
  tokenStore.delete(code);
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) return null;
  return entry.idToken;
}

const CLIENT_KEY_GLOBAL = "__gateway_client_keys__";

type GatewayClientKey = {
  id: string;
  value: string;
  label: string;
};

type ClientKeyState = {
  keys: GatewayClientKey[];
};

function getState() {
  const globalRef = globalThis as typeof globalThis & {
    [CLIENT_KEY_GLOBAL]?: ClientKeyState;
  };

  if (!globalRef[CLIENT_KEY_GLOBAL]) {
    globalRef[CLIENT_KEY_GLOBAL] = {
      keys: [],
    };
  }

  return globalRef[CLIENT_KEY_GLOBAL]!;
}

function maskKey(key: string) {
  if (key.length <= 8) {
    return `${key.slice(0, 2)}***${key.slice(-2)}`;
  }

  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

function createClientKeyValue() {
  return `agw_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function listGatewayClientKeys() {
  return getState().keys.map((item) => ({ ...item }));
}

export function getGatewayClientKeyCount() {
  return getState().keys.length;
}

export function generateGatewayClientKeys(count: number) {
  const state = getState();
  const generated: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const value = createClientKeyValue();
    const id = `gateway-client-key-${state.keys.length + 1}`;
    state.keys.push({
      id,
      value,
      label: maskKey(value),
    });
    generated.push(value);
  }

  return generated;
}

export function revokeGatewayClientKey(key: string) {
  const state = getState();
  state.keys = state.keys.filter((item) => item.value !== key);
}

export function assertGatewayClientKey(key: string | null) {
  if (!key) {
    return false;
  }

  return getState().keys.some((item) => item.value === key);
}

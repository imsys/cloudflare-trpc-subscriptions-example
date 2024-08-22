export type Key = string;
export namespace Key {
  export const prefix = (prefix: string) => `${prefix}__`;

  export namespace ID {
    export const start = () => "00000000-0000-0000-0000-000000000000";
    export const stop = () => "ffffffff-ffff-ffff-ffff-ffffffffffff";
  }
}

export type Keys = string[];
export namespace Keys {
  export const concat = (...keys: Keys) =>
    keys.map((key) => key.replaceAll("__", "")).join("__");
}

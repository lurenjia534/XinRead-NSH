// Each headless test supplies its own responses through open({host}).
export function createHost() {
  return {
    call(name) {
      throw Error("Unexpected host call: " + name);
    },
  };
}

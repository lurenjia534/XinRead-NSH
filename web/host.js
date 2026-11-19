import { books, pickBook } from "./local.js";
export function createHost(shell) {
  let key = "",
    token = 0,
    speech = null;
  const emit = (name, data) => shell.hostEvent("reader." + name, data);
  function stop() {
    ++token;
    speech = null;
    globalThis.speechSynthesis?.cancel();
  }
  const voiceList = () => globalThis.speechSynthesis?.getVoices() || [];
  async function request(path, options) {
    const response = await fetch("/api/" + path, options);
    const payload = await response.json();
    if (!response.ok) throw Error(payload.error || "连接失败");
    return payload.books;
  }
  const methods = {
    async init() {
      return {
        snapshot: await fetch("./featured.json").then((r) => r.json()),
        local: (await books("getAll")).map(({ id, title, author }) => ({
          id,
          title,
          author,
        })),
        settings: JSON.parse(localStorage.getItem("xinread.settings") || "{}"),
      };
    },
    discover: () => request("discover"),
    async connect({ value }) {
      const data = await request("shelf", {
        method: "POST",
        headers: { "X-WeRead-Key": value },
      });
      key = value;
      return data;
    },
    shelf: () =>
      request("shelf", { method: "POST", headers: { "X-WeRead-Key": key } }),
    disconnect() {
      key = "";
    },
    open({ url }) {
      const target = new URL(url);
      if (target.origin !== "https://weread.qq.com")
        throw Error("阅读地址无效");
      window.open(target.href, "_blank", "noopener,noreferrer");
    },
    pick: pickBook,
    async read({ id }) {
      const book = await books("get", id);
      if (!book) throw Error("未找到这本书");
      return {
        chapters: book.chapters.map((c) => c.title),
        position: Number(localStorage.getItem("xinread.pos." + id) || 0),
        markdown: book.markdown,
      };
    },
    async chapter({ id, index }) {
      const book = await books("get", id);
      return book.chapters[index].paragraphs;
    },
    position({ id, index }) {
      localStorage.setItem("xinread.pos." + id, String(index));
    },
    settings(value) {
      localStorage.setItem("xinread.settings", JSON.stringify(value));
    },
    voices: () =>
      voiceList().map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang })),
    stop,
    toggle() {
      const engine = globalThis.speechSynthesis;
      if (!engine || !speech) return "";
      if (engine.paused) {
        engine.resume();
        return "正在朗读";
      }
      engine.pause();
      return "已暂停";
    },
    speak({ paragraphs, rate, volume, voice, start }) {
      const engine = globalThis.speechSynthesis;
      if (!engine) throw Error("此浏览器未提供朗读功能");
      stop();
      const session = token;
      let index = start || 0,
        pieces = [];
      function next() {
        if (session !== token) return;
        if (!pieces.length) {
          if (index >= paragraphs.length) {
            speech = null;
            emit("end", {});
            return;
          }
          emit("paragraph", { index });
          pieces =
            paragraphs[index++].match(/[\s\S]{1,150}[。！？.!?，,、；;]?/gu) ||
            [];
        }
        const utterance = new SpeechSynthesisUtterance(pieces.shift() || " ");
        speech = utterance;
        utterance.lang = "zh-CN";
        utterance.rate = rate;
        utterance.volume = volume;
        utterance.voice = voiceList().find((v) => v.voiceURI === voice) || null;
        utterance.onend = next;
        utterance.onerror = (e) => {
          if (session === token) {
            stop();
            emit("speechError", { message: e.error });
          }
        };
        engine.speak(utterance);
      }
      next();
    },
  };
  function keyboard(e) {
    if (
      e.target.closest?.("input,textarea,select,[contenteditable=true]") ||
      !document.querySelector('[data-testid="local-reader"]')
    )
      return;
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
      ].includes(e.key)
    ) {
      e.preventDefault();
      emit("key", e.key);
    }
  }
  window.addEventListener("keydown", keyboard);
  return {
    call(name, args) {
      return methods[name.slice(7)](args);
    },
    dispose() {
      stop();
      window.removeEventListener("keydown", keyboard);
    },
  };
}

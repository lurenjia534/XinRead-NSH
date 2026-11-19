export function chaptersOf(text, markdown) {
  const chapters = [];
  let current;
  const start = (title) => {
    current = { title, paragraphs: [] };
    chapters.push(current);
  };
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    if (
      (markdown && /^#{1,2}\s+/.test(value)) ||
      (/^(第[零〇一二三四五六七八九十百千万\d]+[章回卷节部][\s：:].*|第[零〇一二三四五六七八九十百千万\d]+[章回卷节部])$/.test(
        value,
      ) &&
        value.length < 90)
    ) {
      start(value.replace(/^#{1,2}\s+/, ""));
    } else {
      if (!current) start("正文");
      current.paragraphs.push(value);
    }
  }
  return chapters;
}
function library() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("xinread-books", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("books", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function books(action, arg) {
  const db = await library();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      "books",
      action === "put" ? "readwrite" : "readonly",
    );
    const request = tx
      .objectStore("books")
      [action](...(arg === undefined ? [] : [arg]));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function pickBook() {
  const file = await new Promise((resolve) => {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".txt,.md,.markdown,text/plain,text/markdown";
    picker.onchange = () => resolve(picker.files[0]);
    picker.oncancel = () => resolve(null);
    picker.click();
  });
  if (!file) return null;
  if (file.size > 12 * 1024 * 1024) throw Error("请选择 12 MB 以内的文本文件");
  const buffer = await file.arrayBuffer();
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("gb18030").decode(buffer);
  }
  const chapters = chaptersOf(text, /\.m(?:d|arkdown)$/i.test(file.name));
  if (!chapters.length) throw Error("文件里没有可读文字");
  const id =
    "local-" +
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
  const book = {
    id,
    title: file.name.replace(/\.[^.]+$/, ""),
    author: "本地读物",
    chapters,
    markdown: /\.m(?:d|arkdown)$/i.test(file.name),
  };
  await books("put", book);
  return { id, title: book.title, author: book.author };
}

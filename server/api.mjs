const origin = "https://weread.qq.com";
const plain = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
export function featured(html) {
  const books = [],
    ids = new Set();
  for (const match of html.matchAll(
    /<a\b[^>]*href="(?:https:\/\/weread\.qq\.com)?(\/web\/reader\/([\w-]+))"[^>]*class="[^"]*wr_suggestion_card_wrapper[^"]*"[^>]*>([\s\S]*?)<\/a>/g,
  )) {
    const [, path, id, block] = match;
    const field = (name) =>
      plain(
        block.match(
          new RegExp("wr_suggestion_card_content_" + name + "[^>]*>([^<]*)<"),
        )?.[1] || "",
      );
    if (!ids.has(id) && field("title")) {
      ids.add(id);
      books.push({
        id,
        title: field("title"),
        author: field("author"),
        cover: plain(block.match(/<img\b[^>]*src="([^"]+)"/)?.[1] || ""),
        url: origin + path,
      });
    }
    if (books.length === 4) break;
  }
  return books;
}
export function safeLink(input) {
  try {
    const url = new URL(input);
    return url.origin === origin && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function api(request, transport = fetch) {
  const path = new URL(request.url).pathname;
  try {
    if (path === "/api/discover" && request.method === "GET") {
      const res = await transport(origin + "/", {
        signal: AbortSignal.timeout(13000),
      });
      if (!res.ok) return json({ error: "微信读书推荐暂时不可用" }, 502);
      const books = featured(await res.text());
      return books.length
        ? json({ books })
        : json({ error: "微信读书暂未返回推荐书目" }, 502);
    }
    if (path === "/api/shelf" && request.method === "POST") {
      const key = request.headers.get("X-WeRead-Key") || "";
      if (!/^wrk-[A-Za-z0-9_-]{6,256}$/.test(key))
        return json({ error: "请填写微信读书签发的 API Key" }, 400);
      const response = await transport(
        "https://i.weread.qq.com/api/agent/gateway",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_name: "/shelf/sync",
            skill_version: "1.0.6",
          }),
        },
      );
      if (!response.ok)
        return json(
          { error: "微信读书未能同步书架，请检查连接与密钥" },
          response.status === 401 || response.status === 403 ? 401 : 502,
        );
      const payload = await response.json(),
        data = payload.data ?? payload;
      if (payload.errcode || !Array.isArray(data.books))
        return json({ error: "微信读书未返回书架，请检查密钥是否有效" }, 422);
      return json({
        books: data.books.map((b) => ({
          id: String(b.bookId),
          title: b.title,
          author: b.author || "",
          cover: b.cover || "",
          url: safeLink(b.readerLink) || safeLink(b.deepLink),
        })),
      });
    }
    return json({ error: "未找到接口" }, 404);
  } catch {
    return json({ error: "微信读书连接超时或暂时不可用，请重试" }, 502);
  }
}

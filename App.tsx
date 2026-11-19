import logo from "./assets/icon.png";
import {
  mount,
  signal,
  View,
  Text,
  Scroll,
  Image,
  WebView,
  host,
  colorScheme,
  windowSize,
} from "nsh";
import { TextView, Input } from "nsh/base";
import type { ScrollRef } from "nsh";

type Book = {
  id: string;
  title: string;
  author: string;
  cover?: string;
  url?: string;
};
type Settings = {
  size: number;
  rate: number;
  volume: number;
  voice: string;
  auto: boolean;
};
const call = <T,>(name: string, args?: unknown) =>
  host.call<T>("reader." + name, args, { timeout: 0 });
const dark = () => colorScheme() === "dark";
const ink = () => (dark() ? "#eaf0f2" : "#122937"),
  muted = () => (dark() ? "#aebdc5" : "#536975");
const ground = () => (dark() ? "#151e24" : "#f7f9fa"),
  surface = () => (dark() ? "#202d35" : "#ffffff"),
  border = () => (dark() ? "#3c4b54" : "#cfdadf");
const blue = () => (dark() ? "#8bcaff" : "#145a91");
const compact = () => windowSize().width < 680;
const tab = signal("discover"),
  page = signal("shelf"),
  remote = signal<Book[]>([]),
  personal = signal<Book[]>([]),
  local = signal<Book[]>([]);
const connected = signal(false),
  query = signal(""),
  error = signal(""),
  info = signal(""),
  busy = signal(false),
  key = signal("");
const selected = signal<Book | null>(null),
  titles = signal<string[]>([]),
  paragraphs = signal<string[]>([]),
  idx = signal(0),
  markdown = signal(false);
const panel = signal(""),
  speaking = signal(""),
  highlight = signal(-1),
  voices = signal<{ id: string; name: string }[]>([]);
const settings = signal<Settings>({
  size: 18,
  rate: 1,
  volume: 1,
  voice: "",
  auto: false,
});
let requestId = 0,
  shelfRequest = 0,
  readerScroll: ScrollRef | null = null,
  offset = 0,
  height = 600;
const msg = (e: unknown) =>
  String(e instanceof Error ? e.message : e).replace(/^Error:\s*/, "");
function stop() {
  void call("stop");
  speaking.set("");
  highlight.set(-1);
}
function leave() {
  ++requestId;
  stop();
  selected.set(null);
  page.set("shelf");
  panel.set("");
  error.set("");
}
function chooseTab(value: string) {
  error.set("");
  query.set("");
  tab.set(value);
}
async function refresh() {
  const id = ++shelfRequest;
  const shelf = tab() === "personal";
  busy.set(true);
  error.set("");
  try {
    const rows = await call<Book[]>(shelf ? "shelf" : "discover");
    if (id === shelfRequest) {
      (shelf ? personal : remote).set(rows);
      info.set("");
    }
  } catch (e) {
    if (id === shelfRequest) {
      if (!shelf && remote().length) info.set("推荐暂未更新，显示最近书单");
      else error.set(msg(e));
    }
  } finally {
    if (id === shelfRequest) busy.set(false);
  }
}
async function connect() {
  if (busy()) return;
  const id = ++shelfRequest;
  busy.set(true);
  error.set("");
  try {
    const rows = await call<Book[]>("connect", { value: key().trim() });
    if (id !== shelfRequest) return;
    personal.set(rows);
    connected.set(true);
    key.set("");
    page.set("shelf");
    chooseTab("personal");
  } catch (e) {
    if (id === shelfRequest) error.set(msg(e));
  } finally {
    if (id === shelfRequest) busy.set(false);
  }
}
function disconnect() {
  ++shelfRequest;
  void call("disconnect");
  personal.set([]);
  connected.set(false);
  busy.set(false);
  chooseTab("discover");
}
function goAccount() {
  key.set("");
  error.set("");
  page.set("account");
}
function external(url: string) {
  void call("open", { url }).catch((e) => error.set(msg(e)));
}
function tune(change: Partial<Settings>) {
  settings.set({ ...settings(), ...change });
  void call("settings", settings());
}
async function readChapter(i: number, autoplay = false) {
  const b = selected();
  if (!b || i < 0 || i >= titles().length) return;
  const id = ++requestId;
  stop();
  panel.set("");
  error.set("");
  try {
    const rows = await call<string[]>("chapter", { id: b.id, index: i });
    if (id !== requestId) return;
    idx.set(i);
    paragraphs.set(rows);
    readerScroll?.scrollTo({ y: 0 });
    offset = 0;
    void call("position", { id: b.id, index: i });
    if (autoplay && rows.length) void speak();
  } catch (e) {
    if (id === requestId) error.set(msg(e));
  }
}
async function openBook(b: Book) {
  error.set("");
  selected.set(b);
  panel.set("");
  const id = ++requestId;
  if (!b.id.startsWith("local-")) {
    if (!b.url) {
      error.set("微信读书未提供这本书的阅读链接");
      return;
    }
    page.set("web");
    return;
  }
  try {
    const data = await call<{
      chapters: string[];
      position: number;
      markdown: boolean;
    }>("read", { id: b.id });
    if (id !== requestId) return;
    titles.set(data.chapters);
    markdown.set(data.markdown);
    paragraphs.set([]);
    page.set("local");
    await readChapter(
      Math.min(Math.max(data.position, 0), data.chapters.length - 1),
    );
  } catch (e) {
    if (id === requestId) error.set(msg(e));
  }
}
async function pick() {
  error.set("");
  try {
    const b = await call<Book | null>("pick");
    if (!b) return;
    local.set([b, ...local().filter((x) => x.id !== b.id)]);
    chooseTab("local");
    await openBook(b);
  } catch (e) {
    error.set(msg(e));
  }
}
async function speak() {
  try {
    if (speaking()) {
      speaking.set(await call<string>("toggle"));
      return;
    }
    if (!paragraphs().length) return;
    speaking.set("正在朗读");
    await call("speak", { ...settings(), paragraphs: paragraphs() });
  } catch (e) {
    speaking.set("");
    error.set(msg(e));
  }
}
const visible = () =>
  (tab() === "local"
    ? local()
    : tab() === "personal"
      ? personal()
      : remote()
  ).filter((b) =>
    (b.title + " " + b.author)
      .toLowerCase()
      .includes(query().trim().toLowerCase()),
  );
function Btn(p: {
  label: string;
  act: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <View
      role="button"
      accessibilityLabel={p.label}
      accessibilityState={{ disabled: !!p.disabled }}
      onPress={() => {
        if (!p.disabled) p.act();
      }}
      class="items-center justify-center rounded-lg px-4 py-2"
      style={{
        minHeight: 40,
        backgroundColor: p.primary ? "#155a92" : surface(),
        borderWidth: 1,
        borderColor: p.primary ? "#155a92" : border(),
        opacity: p.disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: p.primary ? "#fff" : ink(),
        }}
      >
        {p.label}
      </Text>
    </View>
  );
}
function Label(p: { text: string; large?: boolean }) {
  return (
    <Text
      style={{
        fontSize: p.large ? 30 : 15,
        fontWeight: p.large ? "700" : "400",
        color: p.large ? ink() : muted(),
      }}
    >
      {p.text}
    </Text>
  );
}
function Tab(p: { name: string; title: string }) {
  return (
    <View
      role="button"
      accessibilityLabel={p.title}
      onPress={() => {
        if (p.name === "personal" && !connected()) {
          goAccount();
          return;
        }
        chooseTab(p.name);
      }}
      class="justify-center py-3"
      style={{
        borderBottomWidth: 2,
        borderColor: tab() === p.name ? blue() : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: tab() === p.name ? "700" : "400",
          color: tab() === p.name ? blue() : muted(),
        }}
      >
        {p.title}
      </Text>
    </View>
  );
}
function Shelf() {
  const coverWidth = () =>
    compact()
      ? Math.floor((windowSize().width - 58) / 2)
      : Math.min(194, Math.floor((windowSize().width - 142) / 4));
  return (
    <Scroll class="flex-1" contentClass="items-center">
      <View
        class="w-full"
        style={{
          maxWidth: 1100,
          paddingHorizontal: compact() ? 20 : 44,
          paddingVertical: compact() ? 20 : 36,
          gap: 24,
        }}
      >
        <View class="flex-row flex-wrap items-center gap-4">
          <View class="min-w-0 flex-1">
            <Label
              large
              text={
                tab() === "discover"
                  ? "发现好书"
                  : tab() === "personal"
                    ? "我的书架"
                    : "本地书架"
              }
            />
          </View>
          <If when={tab() !== "local"}>
            <Btn
              label={busy() ? "刷新中…" : "刷新"}
              act={() => void refresh()}
              disabled={busy()}
            />
          </If>
          <If when={tab() === "local"}>
            <Btn primary label="导入读物" act={() => void pick()} />
          </If>
        </View>
        <View
          class="flex-row gap-6"
          style={{ borderBottomWidth: 1, borderColor: border() }}
        >
          <Tab name="discover" title="官网推荐" />
          <Tab name="personal" title="我的书架" />
          <Tab name="local" title="本地读物" />
        </View>
        <Input
          accessibilityLabel="搜索书名或作者"
          value={query()}
          onChange={({ value }) => query.set(value)}
          placeholder="搜索书名或作者"
          class="rounded-lg px-4"
          style={{
            height: 44,
            width: "100%",
            maxWidth: 360,
            color: ink(),
            backgroundColor: surface(),
            borderColor: border(),
            borderWidth: 1,
            fontSize: 15,
          }}
        />
        <If when={tab() === "discover" && !!info()}>
          <Label text={info()} />
        </If>
        <View
          class="flex-row flex-wrap"
          style={{ columnGap: compact() ? 16 : 26, rowGap: 26 }}
        >
          <Each of={visible()}>
            {(b) => (
              <View
                role="button"
                accessibilityLabel={"阅读 " + b().title}
                onPress={() => void openBook(b())}
                style={{ width: coverWidth(), gap: 8 }}
              >
                <View
                  class="overflow-hidden rounded-md"
                  style={{
                    width: coverWidth(),
                    height: coverWidth() * 1.43,
                    backgroundColor: dark() ? "#344651" : "#dce7ec",
                    borderWidth: 1,
                    borderColor: border(),
                  }}
                >
                  <If when={!!b().cover}>
                    <Image
                      accessibilityLabel={b().title + " 封面"}
                      src={b().cover}
                      class="absolute inset-0 object-cover"
                      style={{ width: "100%", height: "100%" }}
                    />
                  </If>
                  <If when={!b().cover}>
                    <Text
                      class="p-4 text-xl font-bold"
                      style={{ color: ink() }}
                    >
                      {b().title}
                    </Text>
                  </If>
                </View>
                <Text
                  class="line-clamp-2"
                  style={{ fontSize: 17, fontWeight: "700", color: ink() }}
                >
                  {b().title}
                </Text>
                <Label text={b().author} />
              </View>
            )}
          </Each>
        </View>
        <If when={!visible().length}>
          <Label
            text={
              query()
                ? "没有匹配的书名或作者"
                : tab() === "local"
                  ? "导入 TXT 或 Markdown，即可在本机阅读和朗读。"
                  : busy()
                    ? "正在加载书架…"
                    : "暂无书目"
            }
          />
        </If>
      </View>
    </Scroll>
  );
}
function Account() {
  return (
    <Scroll class="flex-1" contentClass="items-center">
      <View class="w-full gap-5 p-6" style={{ maxWidth: 560 }}>
        <Label large text="连接微信读书" />
        <Label text="在微信读书官网扫码并取得 API Key，即可在小信阅读中查看自己的电子书架。密钥仅在当前页面会话中使用。" />
        <Btn
          label="去微信读书获取 API Key"
          act={() => external("https://weread.qq.com/r/weread-skills")}
        />
        <Input
          masked
          autoComplete="off"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="微信读书 API Key"
          placeholder="wrk-…"
          value={key()}
          onChange={({ value }) => key.set(value)}
          style={{
            height: 46,
            borderRadius: 8,
            paddingHorizontal: 12,
            backgroundColor: surface(),
            color: ink(),
            borderColor: border(),
            borderWidth: 1,
          }}
        />
        <Btn
          primary
          label={busy() ? "正在连接…" : "连接我的书架"}
          act={() => void connect()}
          disabled={!key().trim() || busy()}
        />
        <Btn
          label="扫码打开微信读书网页版"
          act={() =>
            void openBook({
              id: "official-shelf",
              title: "微信读书书架",
              author: "微信读书",
              url: "https://weread.qq.com/web/shelf",
            })
          }
        />
      </View>
    </Scroll>
  );
}
function LocalReader() {
  return (
    <View testID="local-reader" class="min-h-0 flex-1">
      <View
        class="flex-row flex-wrap items-center gap-2 px-4 py-2"
        style={{ backgroundColor: surface() }}
      >
        <Btn
          label="目录"
          act={() => panel.set(panel() === "toc" ? "" : "toc")}
        />
        <Btn
          label="上一章"
          disabled={idx() === 0}
          act={() => void readChapter(idx() - 1)}
        />
        <Btn
          label="下一章"
          disabled={idx() + 1 >= titles().length}
          act={() => void readChapter(idx() + 1)}
        />
        <Btn
          label="减小字号"
          disabled={settings().size <= 12}
          act={() => tune({ size: settings().size - 2 })}
        />
        <Btn
          label="增大字号"
          disabled={settings().size >= 32}
          act={() => tune({ size: settings().size + 2 })}
        />
        <Btn
          label={
            speaking() === "正在朗读"
              ? "暂停"
              : speaking()
                ? "继续朗读"
                : "朗读"
          }
          act={() => void speak()}
        />
        <Btn
          label="朗读设置"
          act={() => {
            panel.set(panel() === "voice" ? "" : "voice");
            void call<{ id: string; name: string }[]>("voices").then(
              voices.set,
            );
          }}
        />
      </View>
      <If when={panel() === "toc"}>
        <Scroll class="flex-1" contentClass="gap-2 p-4">
          <Each of={titles()}>
            {(t, i) => <Btn label={t()} act={() => void readChapter(i())} />}
          </Each>
        </Scroll>
      </If>
      <If when={panel() === "voice"}>
        <Scroll class="flex-1" contentClass="items-center p-4">
          <View class="w-full gap-3" style={{ maxWidth: 600 }}>
            <Label large text="朗读设置" />
            <Btn
              label={"语速 · " + settings().rate + " 倍"}
              act={() =>
                tune({
                  rate: settings().rate >= 2 ? 0.75 : settings().rate + 0.25,
                })
              }
            />
            <Btn
              label={"音量 · " + Math.round(settings().volume * 100) + "%"}
              act={() =>
                tune({
                  volume:
                    settings().volume >= 1 ? 0.25 : settings().volume + 0.25,
                })
              }
            />
            <Btn
              label={"自动读下一章 · " + (settings().auto ? "开" : "关")}
              act={() => tune({ auto: !settings().auto })}
            />
            <Btn label="系统默认语音" act={() => tune({ voice: "" })} />
            <Each of={voices()}>
              {(v) => (
                <Btn
                  label={(settings().voice === v().id ? "✓ " : "") + v().name}
                  act={() => tune({ voice: v().id })}
                />
              )}
            </Each>
            <Btn primary label="完成" act={() => panel.set("")} />
          </View>
        </Scroll>
      </If>
      <If when={!panel()}>
        <Scroll
          ref={(n) => {
            readerScroll = n;
          }}
          onScroll={(e) => {
            offset = e.offset.y;
            height = e.size.height;
          }}
          class="flex-1"
          contentClass="items-center"
        >
          <View class="w-full gap-4 p-6" style={{ maxWidth: 760 }}>
            <Label large text={titles()[idx()] || ""} />
            <Each of={paragraphs()}>
              {(p, i) => (
                <View
                  style={{
                    backgroundColor:
                      highlight() === i()
                        ? dark()
                          ? "#25445b"
                          : "#dbedfd"
                        : "transparent",
                  }}
                >
                  <If when={markdown()}>
                    <TextView
                      selectable
                      markdown={p()}
                      styles={{
                        root: { fontSize: settings().size, color: ink() },
                      }}
                    />
                  </If>
                  <If when={!markdown()}>
                    <Text
                      style={{
                        userSelect: "text",
                        fontSize: settings().size,
                        lineHeight: settings().size * 1.8,
                        color: ink(),
                      }}
                    >
                      {p()}
                    </Text>
                  </If>
                </View>
              )}
            </Each>
          </View>
        </Scroll>
      </If>
    </View>
  );
}
function App() {
  void call<{ snapshot: Book[]; local: Book[]; settings: Partial<Settings> }>(
    "init",
  )
    .then((data) => {
      remote.set(data.snapshot);
      local.set(data.local);
      settings.set({ ...settings(), ...data.settings });
      void refresh();
    })
    .catch((e) => error.set(msg(e)));
  host.on("reader.paragraph", (e: any) => highlight.set(e.index));
  host.on("reader.end", () => {
    speaking.set("");
    highlight.set(-1);
    if (settings().auto && idx() + 1 < titles().length)
      void readChapter(idx() + 1, true);
  });
  host.on("reader.speechError", (e: any) => {
    speaking.set("");
    highlight.set(-1);
    error.set("此设备的语音引擎未能朗读（" + e.message + "）");
  });
  host.on("reader.key", (key: any) => {
    if (page() !== "local" || panel()) return;
    if (key === "ArrowLeft" || key === "ArrowRight")
      void readChapter(idx() + (key === "ArrowLeft" ? -1 : 1));
    else
      readerScroll?.scrollTo({
        y: Math.max(
          0,
          offset +
            height * 0.9 * (key === "ArrowUp" || key === "PageUp" ? -1 : 1),
        ),
        animated: true,
      });
  });
  return (
    <View class="min-h-0 flex-1" style={{ backgroundColor: ground() }}>
      <View
        class="flex-row items-center gap-3 px-5 py-3"
        style={{
          backgroundColor: surface(),
          borderColor: border(),
          borderBottomWidth: 1,
        }}
      >
        <Image src={logo} style={{ width: 34, height: 34, borderRadius: 8 }} />
        <Text
          class="line-clamp-1 flex-1"
          style={{ fontSize: 18, fontWeight: "700", color: ink() }}
        >
          {page() === "web" || page() === "local"
            ? selected()?.title
            : "小信阅读"}
        </Text>
        <If when={page() === "shelf"}>
          <Btn
            primary={!connected()}
            label={connected() ? "断开连接" : "连接书架"}
            act={() => (connected() ? disconnect() : goAccount())}
          />
        </If>
        <If when={page() === "web"}>
          <Btn label="在官网打开" act={() => external(selected()!.url!)} />
        </If>
        <If when={page() !== "shelf"}>
          <Btn
            label="返回书架"
            act={() => {
              if (page() === "account") {
                ++shelfRequest;
                busy.set(false);
                key.set("");
              }
              leave();
            }}
          />
        </If>
      </View>
      <If when={!!error()}>
        <Text
          class="px-5 py-2"
          style={{ color: dark() ? "#ffb9ab" : "#913c29" }}
        >
          {error()}
        </Text>
      </If>
      <If when={page() === "shelf"}>
        <Shelf />
      </If>
      <If when={page() === "account"}>
        <Account />
      </If>
      <If when={page() === "local"}>
        <LocalReader />
      </If>
      <If when={page() === "web"}>
        <WebView
          class="flex-1"
          src={selected()?.url}
          onError={() => error.set("阅读页未载入，可在官网打开。")}
        />
      </If>
    </View>
  );
}
mount(App);

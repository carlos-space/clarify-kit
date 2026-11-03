# clarify-kit

把討論整理成能定案的文件。文件用 TypeScript 寫成 `*.doc.ts`，`clarify-kit build` 把它們編譯成帶 `formatVersion` 的 `index.json`，`clarify-kit check` 檢查文件是否合格。

## 文件源碼

`index.ts` 所在的目錄是一個 entry。它預設匯出 entry 層欄位 `layer`（這個 entry 的文件屬於哪一層）、`describes`（涵蓋哪個產品的哪個版本）與 `publish`（發布到哪裡）。`layer` 必填，沒寫時 `check` 回報 `undeclared-layer`，`build` 失敗。同目錄與子目錄的 `*.doc.ts` 依相對路徑排序收進這個 entry，每個檔預設匯出一份文件。子目錄有另一個 `index.ts` 時，底下的檔案歸那個 entry。

```ts
// docs/main/index.ts
import { defineDocs } from 'clarify-kit'

export default defineDocs({
  layer: 'product',
  describes: { 'my-product': '1.2.0' },
  publish: { target: 'npm', name: 'my-product-docs' },
})
```

```ts
// docs/main/use-x.doc.ts
import { decision, section, text } from 'clarify-kit'

export default decision({
  id: 'use-x',
  title: '採用 X',
  status: 'proposed',
  appliesFrom: 'next',
  sections: [section('context', '背景', [text('為什麼要採用 X。')])],
})
```

`.doc.ts` 用 Node 內建的型別剝除執行，所以只能用可剝除的 TypeScript 語法，相對匯入要寫 `.ts` 副檔名。專案目錄的 `package.json` 要設 `"type": "module"`，否則 Node 會對每個檔案印出模組類型警告。

## 層級與文件引用

`layer` 有四個取值：`org`、`product`、`implementation`、`tool`。前三個由上而下是 `org` > `product` > `implementation`，文件只引用同層或上層的 fact 與文件，引用下層時 `check` 回報 `cites-lower-layer`，`location` 指到引用的文件。`tool` 表示工具的指令、欄位與行為，自家工具與第三方工具都算，每一層都可以引用，由來源自己宣告。跨產品引用不另比較產品，別的產品的 `product`、`implementation` 來源照三級比較。

被引用來源的層級先看它 index 的頂層 `layer`。index 沒有 `layer` 時，在設定檔把來源寫成 `{ "source": "<套件>/<entry>", "layer": "<層>" }`。設定檔和 index 兩邊都有又不同時回報 `layer-mismatch`，兩邊都沒有時，引用它的文件回報 `undeclared-layer`。

文件引用文件時，在 `text` 區塊內寫 `doc:<target>#<id>`。`<target>` 是同專案的 entry 名稱（相對 `docsDir` 的路徑），或 `docSources` 列的 `<套件>/<entry>`，`<id>` 是被引用的文件 id。引用不存在的文件時回報 `unknown-doc-reference`。build 在每份文件的 `docRefs` 記錄這些引用，寫成 `<target>#<id>` 字串。

## 設定檔

`clarify-kit.config.json` 放在專案目錄。沒有設定檔時，工作目錄就是專案目錄，所有設定用預設值。

| 設定 | 意思 | 預設 |
| :--- | :--- | :--- |
| `docsDir` | 文件源碼目錄，相對於設定檔 | `docs` |
| `modules` | 要先載入的模組套件名稱，模組在載入時登記範本與渲染函式 | `[]` |
| `repoRoot` | 倉庫根目錄，相對於設定檔 | 含 `.git` 的最近上層 |
| `factSources` | 文件會引用 fact 的 facts 套件，寫成 `<套件>/<entry>`，例如 `my-product-facts/my-product`，或 `{ "source": "<套件>/<entry>", "layer": "<層>" }`。物件的 `layer` 用在來源 index 沒有 `layer` 時 | `[]` |
| `docSources` | 文件會引用的其他文件套件，列已安裝的 `-docs` 套件 `<套件>/<entry>`，寫法同 `factSources` | `[]` |

## 指令

| 指令 | 做什麼 | 結束碼 |
| :--- | :--- | :--- |
| `clarify-kit build [--config <file>]` | 把每個 entry 編譯成專案目錄下的 `dist/<entry>/index.json`。有檔案載入失敗時不寫任何檔案 | 0 成功，1 載入失敗，2 讀不到輸入 |
| `clarify-kit check [--config <file>] [--json]` | 檢查文件並回報問題，每筆問題有穩定的 `code`、`message` 與 `location` | 0 沒有問題，1 有問題，2 讀不到輸入 |
| `clarify-kit pin --version <v> [--config <file>]` | 把 `docsDir` 底下 `*.doc.ts` 裡文件、段落與區塊的 `since: 'next'` 換成 `<v>`。帶 `pending` 的不動，功能落地時先拿掉 `pending`，下一次 pin 才釘版號 | 0 成功，2 沒給 `--version`、版號不是 semver 或讀不到輸入 |
| `clarify-kit render [--out <dir>] [--version <v>] [--include <label>...] [--config <file>]` | 把文件渲染成 Markdown，每份文件一個檔 `<out>/<entry>/<文件 id>.md`。預設寫到 `os.tmpdir()` 底下的新目錄，`--out` 在 git 工作樹或 `.git/` 內時拒絕（先解析符號連結再比對 git 根目錄），找不到 git 時也拒絕 `--out`。fact 渲染區塊呼叫模組用 `registerRenderer` 登記的函式，收到 `{ version, include, document, section }` | 0 成功，1 `--out` 在 git 工作樹或 `.git/` 內、或無法確認位置，2 讀不到輸入、`--out` 的符號連結無法解析、找不到渲染函式或 fact |

## 讀取與影響分析

- `readDocs('<套件>/<entry>', { version, include, root })` 讀已安裝的 `-docs` 套件。沒給 `version` 或給 `head` 時讀 head，`next` 看得到。給版號時只看 `since` 不晚於它的內容。帶 `pending` 的內容只在讀 head 且 `include` 含該標籤時看得到。`formatVersion` 的 major 不是 1（1.0 與 1.1 都讀，1.1 的 index 帶 `layer`，讀到的 `layer` 在 1.0 是 `undefined`），或 `docs` 結構不對時丟 `DocReadError`。
- `registerDocImpactExtractor()` 向 fact-kit 的 `impactOf` 註冊抽取器，讓影響分析找得到引用某個 fact 的 `*.doc.ts`。認得 `factBlock()` 與 `scenario()` 的 `facts` 裡的 id 字串、從 facts 來源匯入的 fact 物件，以及 `text()` 裡的 `fact:<id>`。算出來的 id 認不得。匯入套件時不會自動註冊。

### check 的錯誤碼

| 錯誤碼 | 意思 |
| :--- | :--- |
| `missing-required-section` | 文件缺範本的必要段落 |
| `unknown-fact-reference` | 區塊引用的 fact 在 `factSources` 的 facts 套件裡找不到 |
| `supersedes-unknown` | `supersedes` 指向的 decision 不在同一個 entry |
| `scenario-without-fact` | requirement 的驗收情境沒有引用 fact |
| `outside-entry` | `*.doc.ts` 不在任何 entry 底下 |
| `load-error` | 檔案載入失敗，或預設匯出不是文件 |
| `duplicate-document-id` | 同一個 entry 內有兩份文件的 `id` 相同 |
| `cites-lower-layer` | 文件引用下層的 fact 或文件，`location` 是引用的文件 |
| `undeclared-layer` | entry 沒寫 `layer`，或被引用的來源 index 與設定檔都沒有層級（後者由引用它的文件回報）。前者 build 同樣失敗 |
| `unknown-doc-reference` | `doc:<target>#<id>` 指向的文件不在同專案的 entry 或 `docSources` 的文件套件裡 |
| `layer-mismatch` | 設定檔寫的層級和來源 index 的 `layer` 不同 |

check 用 fact-kit 的 `loadInstalledIndex` 與 `selectFacts` 讀 `factSources` 的 facts 套件，所以 fact-kit 1.x 與 2.0 格式的 index 都讀得懂。pending 的 fact 也算存在。

### 採納後內文不改

decision 採納後內文不改，record 寫完不改。clarify-kit 不比對內文，也沒有採納指令，所以這兩條規則由 PR 審查把關：審查者看到已採納 decision 或寫完的 record 的內文被改動時，要求作者改開新的 decision（用 `supersedes` 取代舊的）或新的 record。狀態、版本欄位、`since`、`pending` 與 `supersedes` 不算內文，發版釘版號、功能落地時拿掉 `pending` 標籤、把 decision 改成已取代都可以直接改。

## 文件套件慣例

build 出的 `index.json` 要裝進一個發版單元，名稱是 `<RepoName>-docs`，私有倉加 `@<OrgName>/`。它的 `package.json` 照下面設，文件就會預設發布。

```json
{
  "name": "<RepoName>-docs",
  "exports": {
    "./<entry>/index.json": "./dist/<entry>/index.json"
  },
  "files": ["dist"]
}
```

- <RepoName>-docs，私有倉加 @<OrgName>/，例如 @carlos-space/blueprint-poly-hub-docs。`<RepoName>` 是文件所在倉庫的名稱，`<OrgName>` 是倉庫所屬的組織。
- 不設 `"private"`，不設就預設發布。設成 `true` 會讓這個套件不發布。
- `exports` 一個 entry 對應一行，讀取端靠 `<套件>/<entry>/index.json` 找到它。
- `files` 只列 `dist`。
- `describes` 記文件涵蓋的產品版號，這個套件本身是一個發版單元，版號跟著自己的發版流程走。

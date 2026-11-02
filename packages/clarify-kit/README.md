# clarify-kit

把討論整理成能定案的文件。文件用 TypeScript 寫成 `*.doc.ts`，`clarify-kit build` 把它們編譯成帶 `formatVersion` 的 `index.json`，`clarify-kit check` 檢查文件是否合格。

## 文件源碼

`index.ts` 所在的目錄是一個 entry。它預設匯出 entry 層欄位 `describes`（涵蓋哪個產品的哪個版本）與 `publish`（發布到哪裡）。同目錄與子目錄的 `*.doc.ts` 依相對路徑排序收進這個 entry，每個檔預設匯出一份文件。子目錄有另一個 `index.ts` 時，底下的檔案歸那個 entry。

```ts
// docs/main/index.ts
import { defineDocs } from 'clarify-kit'

export default defineDocs({
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

## 設定檔

`clarify-kit.config.json` 放在專案目錄。沒有設定檔時，工作目錄就是專案目錄，所有設定用預設值。

| 設定 | 意思 | 預設 |
| :--- | :--- | :--- |
| `docsDir` | 文件源碼目錄，相對於設定檔 | `docs` |
| `modules` | 要先載入的模組套件名稱，模組在載入時登記範本與渲染函式 | `[]` |
| `repoRoot` | 倉庫根目錄，相對於設定檔 | 含 `.git` 的最近上層 |
| `factSources` | 文件會引用 fact 的 facts 套件，寫成 `<套件>/<entry>`，例如 `my-product-facts/my-product` | `[]` |

## 指令

| 指令 | 做什麼 | 結束碼 |
| :--- | :--- | :--- |
| `clarify-kit build [--config <file>]` | 把每個 entry 編譯成專案目錄下的 `dist/<entry>/index.json`。有檔案載入失敗時不寫任何檔案 | 0 成功，1 載入失敗，2 讀不到輸入 |
| `clarify-kit check [--config <file>] [--json]` | 檢查文件並回報問題，每筆問題有穩定的 `code`、`message` 與 `location` | 0 沒有問題，1 有問題，2 讀不到輸入 |
| `clarify-kit pin --version <v> [--config <file>]` | 把 `docsDir` 底下 `*.doc.ts` 裡文件、段落與區塊的 `since: 'next'` 換成 `<v>`。帶 `pending` 的不動，功能落地時先拿掉 `pending`，下一次 pin 才釘版號 | 0 成功，2 沒給 `--version`、版號不是 semver 或讀不到輸入 |
| `clarify-kit render [--out <dir>] [--version <v>] [--include <label>...] [--config <file>]` | 把文件渲染成 Markdown，每份文件一個檔 `<out>/<entry>/<文件 id>.md`。預設寫到 `os.tmpdir()` 底下的新目錄，`--out` 在 git 工作樹或 `.git/` 內時拒絕（先解析符號連結再比對 git 根目錄），找不到 git 時也拒絕 `--out`。fact 渲染區塊呼叫模組用 `registerRenderer` 登記的函式，收到 `{ version, include, document, section }` | 0 成功，1 `--out` 在 git 工作樹或 `.git/` 內、或無法確認位置，2 讀不到輸入、`--out` 的符號連結無法解析、找不到渲染函式或 fact |
| `clarify-kit adopt <file> [--config <file>]` | decision 改成已採納並寫入內文雜湊，record 只寫入內文雜湊。重跑會更新雜湊 | 0 成功，1 檔案不是 decision 或 record，2 讀不到檔案 |

## 讀取與影響分析

- `readDocs('<套件>/<entry>', { version, include, root })` 讀已安裝的 `-docs` 套件。沒給 `version` 或給 `head` 時讀 head，`next` 看得到。給版號時只看 `since` 不晚於它的內容。帶 `pending` 的內容只在讀 head 且 `include` 含該標籤時看得到。`formatVersion` 的 major 不是 1，或 `docs` 結構不對時丟 `DocReadError`。
- `registerDocImpactExtractor()` 向 fact-kit 的 `impactOf` 註冊抽取器，讓影響分析找得到引用某個 fact 的 `*.doc.ts`。認得 `factBlock()` 與 `scenario()` 的 `facts` 裡的 id 字串、從 facts 來源匯入的 fact 物件，以及 `text()` 裡的 `fact:<id>`。算出來的 id 認不得。匯入套件時不會自動註冊。

### check 的錯誤碼

| 錯誤碼 | 意思 |
| :--- | :--- |
| `missing-required-section` | 文件缺範本的必要段落 |
| `unknown-fact-reference` | 區塊引用的 fact 在 `factSources` 的 facts 套件裡找不到 |
| `adopted-content-changed` | 文件帶 `contentHash`，內文卻和雜湊不同 |
| `supersedes-unknown` | `supersedes` 指向的 decision 不在同一個 entry |
| `scenario-without-fact` | requirement 的驗收情境沒有引用 fact |
| `outside-entry` | `*.doc.ts` 不在任何 entry 底下 |
| `load-error` | 檔案載入失敗，或預設匯出不是文件 |
| `duplicate-document-id` | 同一個 entry 內有兩份文件的 `id` 相同 |

check 用 fact-kit 的 `loadInstalledIndex` 與 `selectFacts` 讀 `factSources` 的 facts 套件，所以 fact-kit 1.x 與 2.0 格式的 index 都讀得懂。pending 的 fact 也算存在。

### 採納後內文不改

decision 與 record 的雜湊只算建置後正規化的內文區塊（section 與 block，key 排序的 JSON），不含狀態、版本欄位、`since`、`pending`、`supersedes` 與被取代的關係。所以發版釘版號、功能落地時拿掉 `pending` 標籤、把 decision 改成已取代都不會被當成改內文。作者重跑 `adopt` 就能更新雜湊，這套機制防的是不小心改到內文，有意的修改仍靠 PR 審查。

## 文件套件慣例

build 出的 `index.json` 要裝進一個發版單元，名稱是 `<product>-docs`。它的 `package.json` 照下面設，文件就會預設發布。

```json
{
  "name": "<product>-docs",
  "exports": {
    "./<entry>/index.json": "./dist/<entry>/index.json"
  },
  "files": ["dist"]
}
```

- `name` 用 `<product>-docs`，`<product>` 是文件涵蓋的產品。
- 不設 `"private"`，不設就預設發布。設成 `true` 會讓這個套件不發布。
- `exports` 一個 entry 對應一行，讀取端靠 `<套件>/<entry>/index.json` 找到它。
- `files` 只列 `dist`。
- `describes` 記文件涵蓋的產品版號，這個套件本身是一個發版單元，版號跟著自己的發版流程走。

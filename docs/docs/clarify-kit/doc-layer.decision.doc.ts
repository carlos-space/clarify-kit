import { decision, factBlock, section, text } from 'clarify-kit'

const next = { since: 'next' } as const

export default decision({
  id: 'doc-layer',
  title: '文件與來源分層，由來源自己宣告層級',
  status: 'accepted',
  appliesFrom: '0.3.0',
  sections: [
    section('context', '背景與理由', [
      text('層級是來源由誰決定的性質，所以由寫它的 entry 宣告，不由讀者推。要守的規則是文件只引用上層，實作引用產品，產品引用組織。facts 與文件共用的層級欄位先建在 fact-kit，clarify-kit 沿用同一組取值。', next),
      text('依目錄或 `describes` 推不出層級。poly-hub 的產品層放在子路徑，單一單元產品的產品名等於單元名，工具層的目錄和產品倉相同。依目錄推還會把某個組織的命名規則寫進通用工具。', next),
      text('第三方與自家工具的介面要能被每一層引用。例如組織決策要引用 GitHub 平台限制，也要引用 clarify-kit 的指令。', next),
    ]),
    section('layers', '層與引用方向', [
      text('取值有 `org`、`product`、`implementation`、`tool` 四個。前三個由上而下是 org > product > implementation，文件只引用同層或上層的 fact 與文件，引用下層時 check 回報 `cites-lower-layer`。', next),
      text('`tool` 表示工具的指令、欄位與行為，自家工具與第三方工具都算，每一層都可以引用。由來源自己宣告，例如 clarify-kit-facts、fact-kit-facts 宣告 `tool`。取值名稱和 facts-authoring 的工具層一致。', next),
      text('跨產品引用不另比較產品。別的產品的 `product`、`implementation` 來源照三級比較，所以組織層文件引用示範倉的產品層文件算引用下層。不把別的產品自動當工具，因為那樣組織層永遠不會引用下層。代價是自家工具的 entry 要自己宣告 `tool`，寫成 `product` 或 `implementation` 時，組織層文件引用它就會被當成引用下層。', next),
      factBlock({ facts: 'clarify-kit.cli.layer' }, next),
    ]),
    section('entry-layer', '文件的層級', [
      text('entry 的 `index.ts` 用 `defineDocs({ layer, describes, publish })` 宣告層級，同一個 entry 的文件同一層。', next),
      text('build 把層級寫進 index 頂層 `layer`，docs index 的 `formatVersion` 升成 `1.1`。讀取端接受 1.0 與 1.1。', next),
      factBlock({ facts: ['clarify-kit.cli.entry-rule', 'clarify-kit.index.fields', 'clarify-kit.index.format-version'] }, next),
    ]),
    section('source-layer', '被引用來源的層級', [
      text('先讀來源 index 的 `layer`。fact-kit 0.13.0 會讓 facts entry 也能宣告它。層級跟著來源寫一次，不讓每個引用端各寫一份，因為各寫一份時同一個來源可能被寫成不同層。', next),
      text('來源 index 沒有 `layer` 時，由引用端在設定檔寫成 `{ "source": "<套件>/<entry>", "layer": "<層>" }`。`factSources` 與新設定 `docSources` 都接受字串或這個物件。', next),
      text('兩邊都有又不同時回報 `layer-mismatch`。兩邊都沒有時，引用它的文件回報 `undeclared-layer`。', next),
      factBlock({ facts: ['clarify-kit.cli.source-layer', 'clarify-kit.cli.config'] }, next),
    ]),
    section('doc-reference', '文件引用文件', [
      text('文件之間的引用要寫成 check 讀得到的形式，才能擋下引用下層的文件。0.2.0 只有 fact 引用，文件引用文件只能寫成散文，check 看不到。', next),
      text('新設定 `docSources` 列已安裝的 `-docs` 套件 `<套件>/<entry>`。文件在 text 區塊內寫引用，target 是同專案的 entry 名稱（相對 `docsDir` 的路徑），或 `docSources` 列的 `<套件>/<entry>`。引用不存在的文件時回報 `unknown-doc-reference`。', next),
      text('index 的每份文件多一個 `docRefs`，值是 `<target>#<id>` 字串陣列，依第一次出現排序，各一次。', next),
      factBlock({ facts: ['clarify-kit.cli.doc-reference', 'clarify-kit.index.doc-fields'] }, next),
    ]),
    section('undeclared', '沒宣告層級就報錯', [
      text('文件 entry 沒寫 `layer` 時，check 回報 `undeclared-layer`，build 失敗（結束碼 1）。沒宣告就報錯，是為了讓規則對每個文件套件都生效。', next),
      text('新增的錯誤碼有四個：`cites-lower-layer`、`undeclared-layer`、`unknown-doc-reference`、`layer-mismatch`。', next),
      factBlock({ facts: 'clarify-kit.check.codes' }, next),
    ]),
    section('package-name', '文件套件的命名', [
      text('文件套件名照 facts 的同一套規則寫 `<RepoName>-docs`，私有倉加 `@<OrgName>/`，例如 `@carlos-space/blueprint-poly-hub-docs`。這取代現行的 `<product>-docs`。', next),
      factBlock({ facts: 'clarify-kit.index.docs-package-convention' }, next),
    ]),
    section('consequences', '影響', [
      text('0.3.0 對既有文件套件不相容，升級時每個 entry 要補 `layer`。', next),
      text('clarify-kit 自己的文件套件 `clarify-kit-docs` 先設 `private: true`、不發布，只在 CI 跑 build 與 check。之後改照 blueprint 的範本接上發布。', next),
    ]),
  ],
})

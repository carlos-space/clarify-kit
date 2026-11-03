import { history } from 'fact-kit'
import { specFacts } from '../../../_lib/spec.ts'

const f = specFacts(['cli'], 'cli')

/** Exit codes shared by every command, the same as fact-kit's. */
const exitCodes = { 0: '成功', 1: '找到問題或操作被拒絕', 2: '用法錯誤或讀不到輸入' }

export default [
  f.value(
    'commands',
    history(
      { since: '0.1.0-alpha.1', value: { binary: 'clarify-kit', commands: ['build', 'check', 'pin', 'render', 'adopt'] } },
        { since: '0.2.0-alpha.1', replace: { '/commands': ['build', 'check', 'pin', 'render'] } },
      ),
      { title: 'CLI 指令清單', description: '`clarify-kit` 的 CLI 指令清單。' },
    ),
    f.value(
      'build',
      history({ since: '0.1.0-alpha.1', value: {
        usage: 'clarify-kit build [--config <file>]',
        does: '把每個 entry 的 `*.doc.ts` 編譯成 `dist/<entry>/index.json`',
        flags: { '--config': '設定檔路徑，預設 `clarify-kit.config.json`' },
        exitCodes,
      } }),
      { title: 'build 指令', description: '編譯文件源碼為帶 `formatVersion` 的 JSON。' },
    ),
    f.value(
      'check',
      history({ since: '0.1.0-alpha.1', value: {
        usage: 'clarify-kit check [--config <file>] [--json]',
        does: '檢查文件源碼並回報問題，錯誤碼見 `clarify-kit.check.codes`',
        flags: { '--config': '設定檔路徑', '--json': '用 JSON 輸出問題，每筆含穩定的 `code`' },
        exitCodes,
      } }),
      { title: 'check 指令', description: '檢查文件，有任何問題時結束碼為 1。' },
    ),
    f.value(
      'adopt',
      history({ since: '0.1.0-alpha.1', value: {
        usage: 'clarify-kit adopt <file> [--config <file>]',
        does: 'decision：把狀態改成已採納並把內文雜湊寫進源碼。record：把內文雜湊寫進源碼',
        hash: '雜湊規則見 `clarify-kit.doc-types.content-hash`',
        flags: { '--config': '設定檔路徑' },
        exitCodes: { ...exitCodes, 1: '檔案不是 decision 或 record，或內文不合法' },
      } }),
      {
        title: 'adopt 指令',
        description: '採納指令。把狀態改成已採納並寫入內文雜湊，重跑會更新雜湊。',
        when: { deprecatedIn: '0.2.0-alpha.1', removeIn: '0.2.0-alpha.1' },
      },
    ),
    f.value(
      'pin',
      history(
      { since: '0.1.0-alpha.1', value: {
          usage: 'clarify-kit pin --version <v> [--config <file>]',
          does: '把 `docsDir` 底下 `*.doc.ts` 裡文件、段落與區塊的 `since: next` 換成版號 `<v>`，用法同 `fact-kit pin`',
          flags: { '--version': '必填，要釘上的版號', '--config': '設定檔路徑' },
          exitCodes: { ...exitCodes, 2: '沒給 `--version` 或版號不是 semver' },
          keeps: '帶 `pending` 的文件、段落與區塊不動，其餘的 `since` 也不動；功能落地時作者先拿掉 `pending`，下一次 pin 才會釘版號。雜湊排除 `since` 與 `pending`，所以 pin 與拿掉標籤都不影響採納後內文的雜湊',
        } },
        { since: '0.2.0-alpha.1', set: { '/keeps': '帶 `pending` 的文件、段落與區塊不動，其餘的 `since` 也不動；功能落地時作者先拿掉 `pending`，下一次 pin 才會釘版號。' } },
      ),
      { title: 'pin 指令', description: '發版時把 `next` 釘成版號，用法同 `fact-kit pin`。' },
    ),
    f.value(
      'render',
      history({ since: '0.1.0-alpha.1', value: {
        usage: 'clarify-kit render [--out <dir>] [--version <v>] [--include <label>...] [--config <file>]',
        does: '把文件渲染成 Markdown',
        flags: {
          '--out': '輸出目錄，預設是系統暫存目錄底下的新目錄',
          '--version': '依版號選內容，規則同讀取 API',
          '--include': '帶入 pending 標籤，可重複',
          '--config': '設定檔路徑',
        },
        exitCodes: { ...exitCodes, 1: '`--out` 在 git 工作樹內' },
      } }),
      { title: 'render 指令', description: '把文件渲染成 Markdown 到工作樹外的位置。' },
    ),
    f.value(
      'render-location',
      history({ since: '0.1.0-alpha.1', value: {
        default: '系統暫存目錄（`os.tmpdir()`）底下的新目錄',
        outInsideWorkTree: '`--out` 指到 git 工作樹或 `.git/` 內時拒絕渲染，印出原因，結束碼非 0（1）',
        why: '渲染產物不進版控，源碼是唯一的真相',
        detect: '找出 `--out` 最近存在的上層目錄並做 `realpath`（處理符號連結），在那裡跑 `git rev-parse --absolute-git-dir` 與 `--show-toplevel`；輸出路徑落在工作樹根目錄或 git 目錄（`.git/`）底下就拒絕。git 回非 0（不在任何倉庫）就放行；找不到 git 執行檔時拒絕 `--out`（結束碼 1），預設的暫存目錄照常放行；符號連結無法解析時結束碼 2',
      } }),
      { title: 'render 只輸出到 git 工作樹外', description: '渲染位置預設在系統暫存目錄，`--out` 在 git 工作樹內時拒絕。' },
    ),
    f.value(
      'config',
      history(
      { since: '0.1.0-alpha.1', value: {
        file: 'clarify-kit.config.json',
        settings: {
          docsDir: '文件源碼目錄，相對於設定檔，預設 `docs`',
          modules: '要載入的模組套件名稱陣列，預設為空',
          repoRoot: '倉庫根目錄，相對於設定檔，預設是含 `.git` 的最近上層',
          factSources: '文件會引用 fact 的 facts 套件，寫成 `<套件>/<entry>` 的陣列，從設定檔所在目錄解析，預設為空',
        },
        precedence: '命令列旗標優先於設定檔',
        projectDir: '設定檔所在目錄是專案目錄，`dist/`、`package.json` 與 facts 套件都從這裡找；沒有設定檔時是工作目錄',
      } },
      { since: 'next',
        replace: { '/settings/factSources': '文件會引用 fact 的 facts 套件，寫成 `<套件>/<entry>` 的字串，或 `{ "source": "<套件>/<entry>", "layer": "<層>" }` 的物件，物件的 `layer` 用在來源 index 沒有 `layer` 時，陣列從設定檔所在目錄解析，預設為空' },
        add: { '/settings': { docSources: '文件會引用的其他文件套件，列已安裝的 `-docs` 套件 `<套件>/<entry>`，寫法同 `factSources`（字串或帶 `layer` 的物件），預設為空' } },
      },
    ),
    { title: '設定檔', description: '`clarify-kit.config.json` 的設定項與預設值。' },
  ),
  f.value(
    'entry-rule',
    history(
      { since: '0.1.0-alpha.1', value: {
        entry: '`index.ts` 所在的目錄就是一個 entry，entry 名稱是它相對 `docsDir` 的路徑',
        collect: '同目錄與子目錄的 `*.doc.ts` 依相對路徑排序收進這個 entry，預設匯出一份文件',
        nested: '子目錄有另一個 `index.ts` 時，底下的檔案歸那個 entry',
        entryFile: '`index.ts` 預設匯出 entry 層欄位 `describes` 與 `publish`',
        outside: '不在任何 entry 底下的 `*.doc.ts` 由 check 回報 `outside-entry`',
        sameAs: 'fact-kit 的 `*.facts.ts` entry 規則',
      } },
      { since: 'next',
        replace: { '/entryFile': '`index.ts` 預設匯出 entry 層欄位 `layer`、`describes` 與 `publish`，用 `defineDocs` 宣告' },
        add: { '': { layer: '`layer` 宣告這個 entry 的文件屬於哪一層，取值見 `clarify-kit.cli.layer`，同一個 entry 的文件同一層；沒寫時 check 回報 `undeclared-layer`，build 失敗（結束碼 1）' } },
      },
    ),
    { title: 'entry 規則', description: '`.doc.ts` 沿用 `*.facts.ts` 的 entry 規則，一份文件套件對應一個 entry。' },
  ),
  f.value(
    'layer',
    history({ since: 'next', value: {
      values: ['org', 'product', 'implementation', 'tool'],
      order: 'org > product > implementation，由上而下',
      citeRule: '`org`、`product`、`implementation` 三層的文件只引用同層或上層的 fact 與文件，引用下層時 check 回報 `cites-lower-layer`',
      tool: '`tool` 表示工具的指令、欄位與行為，自家工具與第三方工具都算，每一層都可以引用，由來源自己宣告',
      declaredBy: '層級由寫它的 entry 宣告，不由讀者依目錄或 `describes` 推算',
      crossProduct: '跨產品引用不另比較產品。別的產品的 `product`、`implementation` 來源照三級比較，所以組織層文件引用別的產品的產品層文件算引用下層。不把別的產品自動當成工具',
      undeclared: '文件 entry 沒宣告 `layer` 時 check 回報 `undeclared-layer`，build 失敗',
    } }),
    { title: '文件與來源的層級', description: '`layer` 的四個取值、引用方向與 `tool` 的意思。' },
  ),
  f.value(
    'source-layer',
    history({ since: 'next', value: {
      first: '先讀被引用來源 index 的頂層 `layer`',
      configFallback: 'index 沒有 `layer` 時，由引用端在設定檔把來源寫成 `{ "source": "<套件>/<entry>", "layer": "<層>" }`，`factSources` 與 `docSources` 都接受',
      mismatch: '設定檔和來源 index 兩邊都有又不同時，check 回報 `layer-mismatch`',
      undeclared: '兩邊都沒有時，引用它的文件回報 `undeclared-layer`',
    } }),
    { title: '被引用來源的層級', description: '來源的層級先看它的 index，index 沒有時看引用端的設定檔。' },
  ),
  f.value(
    'doc-reference',
    history({ since: 'next', value: {
      syntax: '`text` 區塊內寫 `doc:<target>#<id>`',
      target: '同專案的 entry 名稱（相對 `docsDir` 的路徑），或設定檔 `docSources` 列的 `<套件>/<entry>`',
      id: '被引用的文件 id',
      unknown: '引用不存在的文件時 check 回報 `unknown-doc-reference`',
      recorded: 'index 每份文件的 `docRefs` 記錄這些引用，見 `clarify-kit.index.doc-fields`',
    } }),
    { title: '文件引用文件', description: '`text` 區塊用 `doc:<target>#<id>` 引用同專案或已安裝文件套件的文件。' },
  ),
]

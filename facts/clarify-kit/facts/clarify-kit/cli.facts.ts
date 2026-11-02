import { specFacts, next } from '../../../_lib/spec.ts'

const f = specFacts(['cli'], 'cli')

/** Exit codes shared by every command, the same as fact-kit's. */
const exitCodes = { 0: '成功', 1: '找到問題或操作被拒絕', 2: '用法錯誤或讀不到輸入' }

export default [
  f.value(
    'commands',
    next('build-check', { binary: 'clarify-kit', commands: ['build', 'check', 'pin', 'render', 'adopt'] }),
    { title: 'CLI 指令清單', description: '`clarify-kit` 提供 build、check、pin、render 與 adopt 五個指令。' },
  ),
  f.value(
    'build',
    next('build-check', {
      usage: 'clarify-kit build [--config <file>]',
      does: '把每個 entry 的 `*.doc.ts` 編譯成 `dist/<entry>/index.json`',
      flags: { '--config': '設定檔路徑，預設 `clarify-kit.config.json`' },
      exitCodes,
    }),
    { title: 'build 指令', description: '編譯文件源碼為帶 `formatVersion` 的 JSON。' },
  ),
  f.value(
    'check',
    next('build-check', {
      usage: 'clarify-kit check [--config <file>] [--json]',
      does: '檢查文件源碼並回報問題，錯誤碼見 `clarify-kit.check.codes`',
      flags: { '--config': '設定檔路徑', '--json': '用 JSON 輸出問題，每筆含穩定的 `code`' },
      exitCodes,
    }),
    { title: 'check 指令', description: '檢查文件，有任何問題時結束碼為 1。' },
  ),
  f.value(
    'adopt',
    next('build-check', {
      usage: 'clarify-kit adopt <file> [--config <file>]',
      does: 'decision：把狀態改成已採納並把內文雜湊寫進源碼。record：把內文雜湊寫進源碼',
      hash: '雜湊規則見 `clarify-kit.doc-types.content-hash`',
      flags: { '--config': '設定檔路徑' },
      exitCodes: { ...exitCodes, 1: '檔案不是 decision 或 record，或內文不合法' },
    }),
    { title: 'adopt 指令', description: '採納指令。把狀態改成已採納並寫入內文雜湊，重跑會更新雜湊。' },
  ),
  f.value(
    'pin',
    next('pin-read-impact-render', {
      usage: 'clarify-kit pin --version <v> [--config <file>]',
      does: '把文件與區塊的 `since: next` 換成版號 `<v>`，並移除已釋出的 pending 標籤',
      flags: { '--version': '必填，要釘上的版號', '--config': '設定檔路徑' },
      exitCodes: { ...exitCodes, 2: '沒給 `--version` 或版號不是 semver' },
      keeps: '不動內文區塊，所以不影響採納後內文的雜湊',
    }),
    { title: 'pin 指令', description: '發版時把 `next` 釘成版號，用法同 `fact-kit pin`。' },
  ),
  f.value(
    'render',
    next('pin-read-impact-render', {
      usage: 'clarify-kit render [--out <dir>] [--version <v>] [--include <label>...] [--config <file>]',
      does: '把文件渲染成 Markdown',
      flags: {
        '--out': '輸出目錄，預設是系統暫存目錄底下的新目錄',
        '--version': '依版號選內容，規則同讀取 API',
        '--include': '帶入 pending 標籤，可重複',
        '--config': '設定檔路徑',
      },
      exitCodes: { ...exitCodes, 1: '`--out` 在 git 工作樹內' },
    }),
    { title: 'render 指令', description: '把文件渲染成 Markdown 到工作樹外的位置。' },
  ),
  f.value(
    'render-location',
    next('pin-read-impact-render', {
      default: '系統暫存目錄（`os.tmpdir()`）底下的新目錄',
      outInsideWorkTree: '`--out` 指到 git 工作樹內時拒絕渲染，印出原因，結束碼非 0（1）',
      why: '渲染產物不進版控，源碼是唯一的真相',
      detect: '用 `git rev-parse --is-inside-work-tree` 在輸出目錄判斷',
    }),
    { title: 'render 只輸出到 git 工作樹外', description: '渲染位置預設在系統暫存目錄，`--out` 在 git 工作樹內時拒絕。' },
  ),
  f.value(
    'config',
    next('build-check', {
      file: 'clarify-kit.config.json',
      settings: {
        docsDir: '文件源碼目錄，相對於設定檔，預設 `docs`',
        modules: '要載入的模組套件名稱陣列，預設為空',
        repoRoot: '倉庫根目錄，相對於設定檔，預設是含 `.git` 的最近上層',
      },
      precedence: '命令列旗標優先於設定檔',
    }),
    { title: '設定檔', description: '`clarify-kit.config.json` 的設定項與預設值。' },
  ),
  f.value(
    'entry-rule',
    next('build-check', {
      entry: '`index.ts` 所在的目錄就是一個 entry，entry 名稱是它相對 `docsDir` 的路徑',
      collect: '同目錄與子目錄的 `*.doc.ts` 依相對路徑排序收進這個 entry，預設匯出一份文件',
      nested: '子目錄有另一個 `index.ts` 時，底下的檔案歸那個 entry',
      entryFile: '`index.ts` 預設匯出 entry 層欄位 `describes` 與 `publish`',
      outside: '不在任何 entry 底下的 `*.doc.ts` 由 check 回報 `outside-entry`',
      sameAs: 'fact-kit 的 `*.facts.ts` entry 規則',
    }),
    { title: 'entry 規則', description: '`.doc.ts` 沿用 `*.facts.ts` 的 entry 規則，一份文件套件對應一個 entry。' },
  ),
]

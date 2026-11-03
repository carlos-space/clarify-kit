# 發布規劃 v0.3.0

- 類型：milestone
- 狀態：draft
- 產品版號：`v0.3.0`（本文件是產品版號的唯一指派點）
- Milestone：無，倉庫沒有開 Milestone 與 Issue
- 發布分支：`release/v0.3`，從 `main` 切
- 這次發布的單元：clarify-kit（npm `clarify-kit`）、clarify-kit-facts（npm `clarify-kit-facts`）
- 階段路徑：政策檔 `release-policy.json` 的 clarify-kit 與 clarify-kit-facts 都是 `["alpha", "ga"]`，兩個單元都從 `0.3.0-alpha.1` 起

## 含哪些工作

| PR                                                | 單元                           | 狀態              |
| :------------------------------------------------ | :----------------------------- | :---------------- |
| #18 feat!: 文件與來源宣告層級，check 擋下引用下層 | clarify-kit、clarify-kit-facts | 已合回（13219fa） |

文件 entry 用 `defineDocs({ layer, describes, publish })` 宣告層級，取值是 `org`、`product`、`implementation` 與每層都能引用的 `tool`。build 把層級寫進 index 頂層，`formatVersion` 升成 1.1。設定檔的 `factSources` 與新設定 `docSources` 接受字串或 `{ source, layer }`，文件可以用 `doc:<target>#<id>` 引用文件，index 的每份文件多 `docRefs`。check 新增 `cites-lower-layer`、`undeclared-layer`、`unknown-doc-reference`、`layer-mismatch`。clarify-kit-facts 加描述這些行為的 fact，自己宣告 `tool` 層，文件套件命名改成 `<RepoName>-docs`。fact-kit 升到 0.13.0。

規格沒寫、實作照 decision `doc-layer` 推的兩個行為：

- `tool` entry 的文件引用別層時，不回報 `cites-lower-layer`。
- 同一個 fact id 出現在多個 `factSources` 時，取第一個來源的層級。

## 各單元版號

GA 當下由工具產出後貼入，不手抄。

| 單元    | 實作版號 | tag    |
| :------ | :------- | :----- |
| product | 0.3.0    | v0.3.0 |

## 破壞性變更

- 文件 entry 沒寫 `layer` 時，check 回報 `undeclared-layer`，build 失敗（結束碼 1）。遷移：每個 entry 的 `index.ts` 在 `defineDocs` 補 `layer`。
- 被引用的 facts 或文件來源查不到層級時，引用它的文件回報 `undeclared-layer`。遷移：來源 index 沒有 `layer` 時，在設定檔寫成 `{ "source": "<套件>/<entry>", "layer": "<層>" }`。
- 引用下層的 fact 或文件會回報 `cites-lower-layer`。遷移：改成引用同層或上層，或修正來源宣告的層級。
- peerDependencies 的 fact-kit 改成 `^0.13.0`。遷移：消費端的 fact-kit 升到 0.13.0。
- 0.2.0 建出的 1.0 index 仍讀得到，`layer` 是 `undefined`，`docRefs` 讀成 `[]`。

## 怎麼退

- 可回退：消費端固定在 0.2.0，不升到 0.3.0。
- 不可回退：已推送的 tag 與已發布到 npm 的版本，補救再發下一個修補版。

## 變更過程

- 0.3.0-alpha.1：切發布分支
- 0.3.0：GA

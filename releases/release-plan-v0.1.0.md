# 發布規劃 v0.1.0

- 類型：milestone
- 狀態：draft
- 產品版號：`v0.1.0`（本文件是產品版號的唯一指派點。這是倉庫的第一份發布規劃）
- Milestone：無，倉庫沒有開 Milestone 與 Issue
- 發布分支：`release/v0.1`，從 `main` 切
- 這次發布的單元：clarify-kit（npm `clarify-kit`）、clarify-kit-facts（npm `clarify-kit-facts`）
- 階段路徑：政策檔 `release-policy.json` 的 clarify-kit 與 clarify-kit-facts 都是 `["alpha", "ga"]`，兩個單元都從 `0.1.0-alpha.1` 起

## 含哪些工作

| PR | 單元 | 狀態 |
| :--- | :--- | :--- |
| #1 feat: 新增 clarify-kit-facts 與套件空殼，套上版控流程 | clarify-kit、clarify-kit-facts | 已合回（120d34d） |
| #2 feat: 新增文件模型的類型、區塊、主題、範本與模組登記 | clarify-kit、clarify-kit-facts | 已合回（c9bbaad） |
| #3 feat: 新增文件的載入、建置、檢查、採納與 CLI | clarify-kit、clarify-kit-facts | 已合回（3df0e30） |
| #4 feat: 新增文件的 pin、讀取、影響分析與渲染 | clarify-kit、clarify-kit-facts | 已合回（f615556） |
| #5 feat: 新增樣本產品並在 CI 跑完 build、pin 與依版號讀取 | 樣本與 CI，不升版號 | 已合回（553b98b） |

clarify-kit 用和 fact-kit 相同的用法寫意圖、說明與紀錄：4 種文件類型、10 個標準範本、主題與區塊，`build` 建成帶 `formatVersion` 的 JSON，`check`、`adopt`、`pin`、依 `version` 與 `include` 讀取、向 fact-kit 註冊的影響分析與 `render` 都可用。clarify-kit-facts 描述這些定義，共 50 個 fact，沒有 pending 標籤。

## 各單元版號

GA 當下由工具產出後貼入，不手抄。

| 單元 | 實作版號 | tag |
| :--- | :--- | :--- |
| product | 0.1.0 | v0.1.0 |

## 破壞性變更

無既有使用者要遷移。clarify-kit-facts 是第一次發布。npm 上的 clarify-kit `0.0.0-stage` 與 `0.0.1-alpha.1` 是原型，和 0.1.0 的 API 不相容，GA 後標成 deprecated，訊息指向 0.1.0。

## 怎麼退

- 可回退：消費端不升到 0.1.0。原型的 deprecated 訊息可用 `npm deprecate <版本> ""` 撤回。
- 不可回退：已推送的 tag 與已發布到 npm 的版本，補救再發下一個修補版。

## 變更過程

- 0.1.0-alpha.1：切發布分支
- 0.1.0：GA

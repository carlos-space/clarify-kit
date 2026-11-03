# 發布規劃 v0.2.0

- 類型：milestone
- 狀態：draft
- 產品版號：`v0.2.0`（本文件是產品版號的唯一指派點）
- Milestone：無，倉庫沒有開 Milestone 與 Issue
- 發布分支：`release/v0.2`，從 `main` 切
- 這次發布的單元：clarify-kit（npm `clarify-kit`）、clarify-kit-facts（npm `clarify-kit-facts`）
- 階段路徑：政策檔 `release-policy.json` 的 clarify-kit 與 clarify-kit-facts 都是 `["alpha", "ga"]`，兩個單元都從 `0.2.0-alpha.1` 起

## 含哪些工作

| PR                                                               | 單元                           | 狀態              |
| :--------------------------------------------------------------- | :----------------------------- | :---------------- |
| #11 feat!: 移除內文雜湊與 adopt 指令，採納與寫完改由 PR 審查把關 | clarify-kit、clarify-kit-facts | 已合回（5753607） |
| #12 chore(deps): fact-kit 升到 0.12.1                            | 依賴升級，不單獨升版號         | 已合回（614ea09） |

clarify-kit 移除內文雜湊（`contentHash`）、`adopt` 指令與 `adopted-content-changed` 檢查。文件的採納與寫完改由 PR 審查把關，不再由工具比對雜湊。clarify-kit-facts 同步移除描述這些行為的 fact。fact-kit 升到 0.12.1，讓 `fact-kit pin` 把 `when.deprecatedIn`、`when.removeIn` 的 `next` 一併釘成版號。

## 各單元版號

GA 當下由工具產出後貼入，不手抄。

| 單元    | 實作版號 | tag    |
| :------ | :------- | :----- |
| product | 0.2.0    | v0.2.0 |

## 破壞性變更

- `clarify-kit adopt` 變成未知指令，結束碼 2。遷移：刪掉呼叫 `adopt` 的腳本與 CI 步驟，改由 PR 審查確認內文。
- 源碼裡的 `contentHash` 欄位會被當成未知欄位報錯。遷移：從文件源碼刪掉 `contentHash`。
- 套件入口不再匯出 `bodyOf` 與 `contentHashOf`。遷移：移除這兩個函式的呼叫。
- `adopted-content-changed` 檢查移除。
- clarify-kit-facts 以 0.2.0 讀不到 `cli.adopt` 與 `doc-types.content-hash`，以 0.1.0 讀仍讀得到。這兩個 fact 以 `deprecatedIn`、`removeIn` 退場。

## 怎麼退

- 可回退：消費端固定在 0.1.0，不升到 0.2.0。
- 不可回退：已推送的 tag 與已發布到 npm 的版本，補救再發下一個修補版。

## 變更過程

- 0.2.0-alpha.1：切發布分支
- 0.2.0：GA

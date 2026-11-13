# Release Plan v0.3.2（維護型）

- 類型：maintenance（由 plan.sh maintenance 寫出）
- 狀態：draft
- 產品版號：`v0.3.2`（本 plan 是版號的唯一指派點）
- 上一份：`v0.3.1`
- 入版單元：`clarify-kit`、`clarify-kit-facts`
- 含哪些工作：倉庫轉到 promptex-ai 後的第一版，repository 與著作權人改成新位置（#34）。clarify-kit-facts 的 describesOf 帶單元目錄，跟上 blueprint 範本 v0.11.0（#33）。README 的 pin 一列寫明也釘 requirement 的 release 與 decision 的 appliesFrom（#32，docs 不觸發發版）。從 `v0.3.1` 重建發布分支，用 `git cherry-pick -x` 帶入 `455efe8`、`41ebab4` 與 `bbaab76`。先發 alpha 再發正式版。
- 破壞性變更：沒有。

## Snapshot 對照（GA 當下由 `pnpm snapshot --check-tags` 產出後貼入）

| 單元 | 路徑 | 實作版號 | tag |
| :--- | :--- | :--- | :--- |
| product | package.json | 0.3.2 | v0.3.2 |

## Rollback

- 可回退：消費端固定在 0.3.1，不升到 0.3.2。
- 不可回退：已推送的 tag 與已發布到 npm 的版本。補救走下一個維護型發布。

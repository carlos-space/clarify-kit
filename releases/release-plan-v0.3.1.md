# Release Plan v0.3.1（維護型）

- 類型：maintenance（由 plan.sh maintenance 寫出）
- 狀態：draft
- 產品版號：`v0.3.1`（本 plan 是版號的唯一指派點）
- 上一份：`v0.3.0`
- 入版單元：`clarify-kit`、`clarify-kit-facts`
- 含哪些工作：`pin --version` 也釘 requirement 的 `release` 與 decision 的 `appliesFrom`，欄位取自 `DOC_TYPES`（#24 改 fact，#25 改實作）。從 `v0.3.0` 重建發布分支，用 `git cherry-pick -x` 帶入 `a500afc` 與 `afc9bea`。
- 破壞性變更：沒有。

## Snapshot 對照（GA 當下由 `pnpm snapshot --check-tags` 產出後貼入）

| 單元 | 路徑 | 實作版號 | tag |
| :--- | :--- | :--- | :--- |
| product | package.json | 0.3.1 | v0.3.1 |

## Rollback

- 可回退：消費端固定在 0.3.0，不升到 0.3.1。
- 不可回退：已推送的 tag 與已發布到 npm 的版本。補救走下一個維護型發布。

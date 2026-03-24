# E2E Tests

Playwright を使用したブラウザ自動テスト。ブラウザ: Chrome (`localhost:8081`)

## 実行方法

```bash
npm run test:e2e
```

---

## ファイル一覧

### `lobby.spec.ts`
**最終更新コミット:** `2d0c47e` refactor(e2e): reduce redundant E2E tests to smoke tests only

ロビー画面のスモークテスト。

| テスト名 | 内容 |
|---|---|
| `debug mode navigates to game screen` | プレイヤー数2、デバッグモードを選択して「ゲーム開始」を押すと `/game` 画面に遷移し、`fold-btn` が表示される |

---

### `hotseat.spec.ts`
**最終更新コミット:** `2d0c47e` refactor(e2e): reduce redundant E2E tests to smoke tests only

ホットシートモード（1台の端末を複数人でまわすモード）のスモークテスト。

| テスト名 | 内容 |
|---|---|
| `shows pass-device screen on turn change` | 3人ホットシートゲームを開始し、`call` アクションを行うと次プレイヤーへの「端末を渡してください」画面が表示される |

---

### `helpers.ts`
**最終更新コミット:** `2d0c47e` refactor(e2e): reduce redundant E2E tests to smoke tests only

各テストから呼び出す共通ヘルパー。

| 関数 | 内容 |
|---|---|
| `startHotseatGame(page, playerCount)` | ロビーからホットシートモードでゲームを開始し、ゲーム画面の表示を待つ |

# Flowcus (TaskChute-like)

TaskChute 的な「今日のパイプライン」→「開始/停止で実績記録」→「ログ確認」を行う最小構成の Expo + TypeScript アプリです。

## セットアップ

```
pnpm i   # or npm i / yarn
pnpm start
```

Android/iOS は Expo Go で動作確認できます。

## 構成

- `App.tsx`: 3 タブ（Today / Tasks / Log）
- `src/types.ts`: 型定義
- `src/storage.ts`: AsyncStorage を使った保存
- `src/context/TasksContext.tsx`: タスク/パイプライン/ログ/実行中の状態管理
- `src/screens/TodayScreen.tsx`: 今日のパイプライン、開始/停止、簡易並べ替え
- `src/screens/TasksScreen.tsx`: タスク作成・削除、今日への追加
- `src/screens/LogScreen.tsx`: 本日の実績ログ一覧

## 使い方

1. Tasks でタスクを作成（色と予定分を設定）
2. 「今日に追加」でパイプラインへ
3. Today で順番を上下ボタンで調整し「開始」
4. 作業が終わったら「停止」→ Log に記録

## 今後の拡張アイデア

- 予定 vs 実績の可視化（進捗バー）
- 1 日ルーチンのテンプレート化と複製
- 週/日単位のアナリティクス
- ストップ時のメモ入力ダイアログ
- ドラッグ&ドロップでの並べ替え
- 画像（`public/images`）の UI に寄せたスタイル調整


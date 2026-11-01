---
project: Actio
kind: task
created: 2026-11-01
---

# Cc の指示者を操作ログに残す (パターン2)

依頼: neco「Cc の指示の主体を見分けたい」→「2 から始めて 3 へ」→「操作ログだけ（おすすめ）」(2026-11-01)。

仕様: `spec/feature/cc-acting-for.md`

## 受入条件

- [x] loopback の書き込みに `x-actio-acting-for` が付いていれば操作ログに 1 行残す。
- [x] loopback 以外の申告、形式不正の申告は記録しない。
- [x] DB には保存しない。記録失敗で応答を変えない。

## 後続

- Concordia: Actio への書き込みに直近の指示者を付ける
- パターン 3: Discord ↔ Cernere の対応付け

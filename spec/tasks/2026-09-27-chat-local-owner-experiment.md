---
task: chat-local-owner-experiment
project: At
kind: fix
created: 2026-09-27
memory_links: []
---

Approval: neco「今回はCcで動く構成で動かせるようにして実験する」。

既存のlocal-owner認証境界をチャット設定・確定にも適用する。API clientや未検証actio-localは拒否し、対象チーム存在確認は従来middlewareを維持。Cc接続と実投稿の実験を可能にするための修正。

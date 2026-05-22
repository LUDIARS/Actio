/**
 * WS Command Registration — 全モジュールのハンドラを登録
 *
 * このファイルをインポートすると、全コマンドハンドラが
 * dispatcher に登録される。
 */

// calendar.ts は Schedula に分離 (2026-05-20 split-task-only)
import "./group.js";
// myplan.ts は @ludiars/schedula-module-myplan に移行
// voting.ts は @ludiars/schedula-module-voting に移行
// facility.ts は Aedilis に分離 (2026-05-20 split-task-only)
import "./pm.js";
import "./admin.js";

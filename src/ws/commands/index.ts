/**
 * WS Command Registration — 全モジュールのハンドラを登録
 *
 * このファイルをインポートすると、全コマンドハンドラが
 * dispatcher に登録される。
 */

import "./calendar.js";
import "./group.js";
import "./myplan.js";
// voting.ts は modules-ext/voting/ に移行済み (SDK wsCommands 経由で登録)
import "./facility.js";
import "./pm.js";
import "./admin.js";

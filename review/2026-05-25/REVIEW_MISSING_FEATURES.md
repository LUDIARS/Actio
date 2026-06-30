# 不足機能評価 — Actio (2026-05-25)

## 対象

| 項目 | 値 |
|------|-----|
| リポジトリ | Actio |
| 対象ブランチ | main (c959421..857bdac) |
| レビュー実施日 | 2026-05-25 |
| 対象コミット範囲 | `857bdac` (tests/auth/paseto-verify.test.ts) |

---

## 1. テスト対象実装 (src/auth/paseto-verify.ts) の未実装リスク

### 既知 Medium リスク (전회 2026-05-24 指摘)

| 機能 | 重大度 | 説명 | 対応方針 |
|------|--------|------|---------|
| **PASETO 무효 token 대량投여시 rate-limit** | Medium | kid 순차시도 (O(n)) 로 CPU 소비 선형증가. 무효 token 을 간격두고 投여하면 CPU resource 낭비 가능 | `src/app.ts` 의 grlobal rate-limit 확대 (현재: setup only) → `/api/*` 전역 적용 권장 |
| **PASETO kid rotation 관찰성 부족** | Low | 6h 주기 refresh 성공/실패 log 는 console.warn/log. production metrics 미통계 | prometheus/datadog metrics 추가 (별도 PR, 우선도 낮음) |

### 테스트로 강화된 부분

- §2 (expired token) → expiry path verification
- §4 (tampered signature) → crypto verify failure path
- §6 (fetch failure) → cache resilience
- 통합:** 무효 token 11 ケース 모두 early rejection 확인 → rate-limit 있어도 악용 가능성은 남음

**結論**: 테스트 추가 만으로는 O(n) CPU risk 미래결. src/app.ts rate-limit 통합 필수.

---

## 2. テスト스스로의 미완성 기능

### 장기 운영 (長期運用) 범위

| 기능 | 필요도 | 설명 |
|------|--------|------|
| **Vitest coverage report 생성** | Low | `vitest run --coverage` 로 coverage % 지표 생성. CI에 report 저장 권장 |
| **kid cache hit rate 통계** | Low | test 에서 kid hit/miss count 관찰 가능하나, production instrumentation 필요 |
| **공개키 fetch latency benchmark** | Low | Cernere network 지연 측정. performance SLI 설정 시 필요 |

### 테스트 유지보수 (Maintenance)

| 작업 | 주기 | 설명 |
|------|------|------|
| **paseto lib 버전업 대응** | ~quarterly | paseto@^3 → v4 같은 major bump 시 test 재검토 필요 |
| **Cernere API 변경 대응** | as-needed | /.well-known/cernere-public-key response schema 변경 시 test fixture 업데이트 |

---

## 3. 기능 개선 (Enhancement) 제안

### 낮은 우선도 (실장 불필요, 고려사항)

| 기능 | 우선도 | 설명 | 기술적 고려 |
|------|--------|------|-----------|
| **kid rotation 예측 테스트** | Low | key rotation 발생 전 预测/warn → exponential backoff 재시도 | 복합도 ↑, 실제 필요성 불명확 |
| **PASETO 포맷 버전업 (V5)** | Low | PASETO spec v2 (V5) 표준화 대기 중. 현재 V4 (2023 표준) 로 sufficient | lib dependency upgrade 만 필요 |
| **Cache backend 교체** | Low | in-memory Map → Redis 옵션 (분산 환경) | 단일 프로세스 Actio 에서 필요성 낮음. 향후 multi-process cluster 시 고려 |

---

## 4. 前回レビュー (2026-05-24) 指摘 상태 추적

| 지적사항 | 상태 | 본 PR 대응 | 향후 계획 |
|---------|------|----------|---------|
| Medium XSS (declarative.ts:151) | **Carry forward** | テスト対象外 | 별도 PR 필수 |
| PASETO rate-limit (無効 token CPU) | **Validated by test** | test coverage O, fix pending | src/app.ts 전역 rate-limit 추가 |
| PASETO unit test 부족 | **✅ Resolved** | 11 ケース 추가 | — |
| npm audit CI 통합 미흡 | **Carry forward** | 테스트와 무관 | .github/workflows/test.yml 에 npm audit step 추가 |

---

## 5. 현 상황 요약

### 본 PR (857bdac) 의 기여

✅ PASETO V4 token verification 의 security-critical coverage gap 폐쇄
✅ 11 ケース로 attack surface (expired, tampered, audience mismatch) + resilience (network, cache) 양쪽 검증
✅ Test code quality (A-grade): mock strategy, isolation, documentation 완비

### 미해결 과제 (别 PR 필요)

- [ ] `src/app.ts` 글로벌 rate-limit 강화 (`/api/*` 전역)
- [ ] `frontend/src/declarative.ts:151` innerHTML → textContent 수정
- [ ] CI 에 `npm audit` step 추가
- [ ] (optional) Vitest coverage report 생성 + CI 저장

---

## 総合評価

본 commit 은 **테스트 품질만으로 A-grade**를 달성했으며, 미완성 부분 (rate-limit, XSS fix, npm audit CI) 은 스코프 외.

향후 roadmap:
1. **우선**: rate-limit 강화 PR → 무효 token CPU risk 제거
2. **병렬**: declarative.ts XSS 수정 → Medium risk 해결
3. **장기**: npm audit CI 통합 → supply-chain security 강화


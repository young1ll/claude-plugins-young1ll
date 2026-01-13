# PM Plugin Architecture

CORE.md 기반 재설계 아키텍처 문서.

## 설계 원칙

1. **MCP 통합**: Resources/Tools/Prompts 패턴
2. **하이브리드 에이전트**: Plan-and-Execute + ReAct + Reflexion
3. **토큰 효율화**: 계층적 요약, 70% 규칙
4. **이벤트 소싱**: 완전한 감사 추적
5. **Git 통합**: Linear/GitHub 패턴

## 디렉토리 구조

```
plugins/pm/
├── .claude-plugin/
│   ├── plugin.json              # 플러그인 매니페스트
│   └── mcp.json                 # MCP 서버 설정
│
├── mcp/                         # MCP 서버 구현
│   ├── server.ts                # MCP 서버 엔트리포인트
│   ├── resources/               # 정적 리소스 (스키마, 메타데이터)
│   │   ├── schema.ts            # pm://schema/* 리소스
│   │   └── metadata.ts          # pm://meta/* 리소스
│   ├── tools/                   # 동적 도구 (CRUD, 분석)
│   │   ├── task-crud.ts         # pm_task_* 도구
│   │   ├── sprint.ts            # pm_sprint_* 도구
│   │   ├── velocity.ts          # pm_velocity_* 도구
│   │   └── analytics.ts         # pm_analytics_* 도구
│   └── prompts/                 # 템플릿 프롬프트
│       ├── sprint-planning.ts   # 스프린트 계획 템플릿
│       ├── retrospective.ts     # 회고 템플릿
│       └── risk-assessment.ts   # 리스크 평가 템플릿
│
├── agents/                      # 에이전트 정의
│   ├── pm-planner.md            # Plan-and-Execute: 전략적 계획
│   ├── pm-executor.md           # ReAct: 적응적 실행
│   ├── pm-reflector.md          # Reflexion: 자기 개선
│   └── ticket-worker.md         # 이슈 구현 에이전트
│
├── commands/                    # 슬래시 명령어
│   ├── init.md                  # 프로젝트 초기화
│   ├── task.md                  # 태스크 CRUD
│   ├── sprint.md                # 스프린트 관리
│   ├── plan.md                  # 계획 수립
│   ├── status.md                # 상태 확인
│   ├── velocity.md              # 속도 분석
│   ├── retro.md                 # 회고
│   └── sync.md                  # 동기화
│
├── hooks/                       # 이벤트 훅
│   ├── hooks.json               # 훅 설정
│   └── scripts/
│       ├── pre-commit.sh        # 커밋 전 태스크 링크 검증
│       ├── post-commit.sh       # 커밋 후 태스크 상태 업데이트
│       └── session-end.sh       # 세션 종료 시 요약 저장
│
├── skills/
│   └── pm/
│       ├── SKILL.md             # PM 도메인 전문성
│       └── references/
│           ├── estimation.md    # 추정 패턴
│           ├── workflows.md     # 워크플로우 템플릿
│           └── conventions.md   # PM 컨벤션
│
├── storage/                     # 저장소 계층
│   ├── schema.sql               # SQLite 스키마 (Warm tier)
│   ├── migrations/              # 마이그레이션
│   └── lib/
│       ├── db.ts                # 데이터베이스 유틸리티
│       ├── events.ts            # 이벤트 소싱
│       └── cache.ts             # Hot tier 캐시
│
├── lib/                         # 공통 유틸리티
│   ├── context.ts               # 컨텍스트 압축
│   ├── summarizer.ts            # 계층적 요약
│   └── git.ts                   # Git 통합
│
├── ARCHITECTURE.md              # 이 문서
├── CORE.md                      # 설계 원칙 문서
└── README.md                    # 사용자 문서
```

## MCP 통합 설계

### Resources (정적, 사용자/앱 제어)

```
pm://schema/task          # 태스크 스키마 정의
pm://schema/sprint        # 스프린트 스키마 정의
pm://meta/team            # 팀 디렉토리
pm://meta/velocity        # 속도 계산 방법
pm://docs/conventions     # PM 컨벤션 문서
```

### Tools (동적, 모델 호출)

```typescript
// CRUD
pm_task_create(title, description, sprint_id?, priority?)
pm_task_update(task_id, updates)
pm_task_list(filter?, page?, limit?)
pm_task_get(task_id)
pm_task_delete(task_id)

// Sprint
pm_sprint_create(name, start_date, end_date)
pm_sprint_add_tasks(sprint_id, task_ids)
pm_sprint_status(sprint_id)

// Analytics
pm_velocity_calculate(sprint_ids?)
pm_burndown_data(sprint_id)
pm_cycle_time(task_ids?)

// Git Integration
pm_link_commit(task_id, commit_sha)
pm_task_from_branch()  // 현재 브랜치에서 태스크 ID 추출
```

### Prompts (템플릿, 사용자 시작)

```
sprint-planning     # 스프린트 계획 세션
retrospective       # 회고 세션
risk-assessment     # 리스크 평가
daily-standup       # 데일리 스탠드업
```

## 에이전트 아키텍처

### 1. PM Planner (Plan-and-Execute)

전략적 계획 수립. 스프린트 계획, 로드맵 생성, 에픽 분해.

```markdown
---
description: Strategic planning agent using Plan-and-Execute pattern
tools: [pm_task_*, pm_sprint_*, Read, Write]
---

## Role
프로젝트 관리자로서 장기 목표를 유지하며 복잡한 작업을 분해합니다.

## Pattern: Plan-and-Execute
1. 목표 분석 → 다단계 계획 생성
2. 각 단계를 pm-executor에 위임
3. 진행 상황 모니터링 및 계획 조정
```

### 2. PM Executor (ReAct)

적응적 실행. 백로그 정리, 의존성 조사, 이해관계자 Q&A.

```markdown
---
description: Adaptive execution agent using ReAct pattern
tools: [pm_task_*, Bash, Read, Grep]
---

## Role
Thought → Action → Observation 사이클로 동적 작업 실행.

## Pattern: ReAct
1. Thought: 현재 상황 분석
2. Action: 도구 호출
3. Observation: 결과 관찰
4. 반복...
```

### 3. PM Reflector (Reflexion)

자기 개선. 추정 오류 학습, 회고 결과 반영.

```markdown
---
description: Self-improvement agent using Reflexion pattern
tools: [pm_velocity_*, Read, Write]
---

## Role
과거 패턴에서 학습하여 추정 정확도 향상.

## Pattern: Reflexion
1. 작업 결과 평가
2. 언어적 피드백 생성
3. 에피소딕 메모리에 저장
4. 다음 추정에 반영
```

## 토큰 효율화 전략

### 계층적 요약

| Level | 내용 | 트리거 |
|-------|------|--------|
| L0 (Raw) | 개별 태스크 업데이트, 코멘트, 커밋 | N/A |
| L1 (Story) | 스토리 요약, 주요 결정, 블로커 | 20 메시지마다 |
| L2 (Epic) | 에픽 진행, 리스크, 교차 의존성 | 주간 또는 마일스톤 |
| L3 (Project) | 프로젝트 헬스, 전략적 결정 | 세션 경계 |

### 70% 규칙

컨텍스트 70% 도달 전 압축. 압축 후 40-50% 작업 공간 유지.

### 데이터 직렬화

- JSON → CSV 변환으로 40-50% 절감
- 커스텀 컴팩트 포맷으로 최대 90% 절감
- 대시보드: 전체 객체 대신 카운트/그룹 반환

## 저장소 계층

### Hot Tier (Redis/메모리)

- 활성 세션 상태
- 최근 N개 도구 출력
- 즉시 태스크 컨텍스트
- 보존: 세션 기간

### Warm Tier (SQLite)

- 대화 히스토리
- 에피소딕 트레이스
- 태스크 스냅샷
- 보존: 일~주

### Cold Tier (Vector DB)

- 히스토리컬 임베딩
- 완료된 회고
- 검색 가능 아카이브
- 보존: 영구

## 이벤트 소싱

### 핵심 이벤트 타입

```typescript
type TaskEvent =
  | { type: 'TaskCreated'; payload: { title, description, projectId } }
  | { type: 'TaskStatusChanged'; payload: { from: string; to: string } }
  | { type: 'TaskEstimated'; payload: { points: number; confidence: number } }
  | { type: 'TaskLinkedToCommit'; payload: { commitSha, repo } }
  | { type: 'TaskAddedToSprint'; payload: { sprintId } }
  | { type: 'TaskCompleted'; payload: { actualPoints?: number } };
```

### CQRS 패턴

- 쓰기 모델: 커맨드 핸들러
- 읽기 모델: 프로젝션 (분석용 최적화)

## Git 통합 (Linear/GitHub 패턴)

### 브랜치 명명

```
{TASK_ID}-{description}
예: PM-123-add-user-auth
```

### Magic Words (커밋 메시지)

```
fixes PM-123      → 태스크 완료 처리
closes PM-123    → 태스크 완료 처리
refs PM-123      → 태스크 링크 (상태 변경 없음)
```

### 훅 통합

```bash
# pre-commit: 브랜치에서 태스크 ID 추출, 커밋 메시지에 자동 추가
# post-commit: 태스크에 커밋 링크, magic word 처리
```

## 구현 로드맵

### Phase 1: 기반 구축
- [ ] SQLite 스키마 설계
- [ ] 이벤트 소싱 기반 구현
- [ ] 기본 CRUD 도구

### Phase 2: MCP 통합
- [ ] MCP 서버 구현
- [ ] Resources/Tools/Prompts 정의
- [ ] Claude Code 연동 테스트

### Phase 3: 에이전트
- [ ] PM Planner 구현
- [ ] PM Executor 구현
- [ ] PM Reflector 구현

### Phase 4: 고급 기능
- [ ] 토큰 효율화 (계층적 요약)
- [ ] Git 통합
- [ ] Velocity 분석 및 학습

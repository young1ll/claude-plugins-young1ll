# PM Plugin for Claude Code

AI 기반 프로젝트 관리 플러그인.

**Plan-and-Execute**, **ReAct**, **Reflexion** 패턴을 결합한 하이브리드 에이전트 아키텍처로
MCP 서버를 통해 프로젝트 관리 데이터와 통합됩니다.

## 핵심 특징

- **MCP 통합**: Resources/Tools/Prompts 패턴으로 98.7% 토큰 절감
- **이벤트 소싱**: 완전한 감사 추적 및 시점별 상태 재구성
- **하이브리드 에이전트**: 전략적 계획 + 적응적 실행 + 자기 개선
- **Git 통합**: Linear/GitHub 스타일 브랜치 명명 및 magic words
- **토큰 효율화**: 계층적 요약 (L0-L3) 및 70% 압축 규칙

## 설치

```bash
# Claude Code에서
/plugins add pm@done
```

## 아키텍처

```
Plan-and-Execute (전략적 계획)
        ↓
    ReAct (적응적 실행)
        ↓
   Reflexion (자기 개선)
        ↓
    MCP Server (데이터 통합)
        ↓
    SQLite (이벤트 소싱)
```

## MCP 도구

### Resources (정적)
```
pm://schema/task          # 태스크 스키마
pm://schema/sprint        # 스프린트 스키마
pm://meta/velocity        # 속도 계산 방법
pm://docs/conventions     # PM 컨벤션
```

### Tools (동적)
```typescript
// CRUD
pm_task_create(title, projectId, ...)
pm_task_list(filter?)
pm_task_get(taskId)
pm_task_update(taskId, updates)
pm_task_status(taskId, status)

// Sprint
pm_sprint_create(name, startDate, endDate)
pm_sprint_status(sprintId)
pm_sprint_add_tasks(sprintId, taskIds)

// Analytics
pm_velocity_calculate(projectId)
pm_burndown_data(sprintId)

// Git Integration
pm_link_commit(taskId, commitSha)
pm_task_from_branch()
```

### Prompts (템플릿)
```
sprint-planning      # 스프린트 계획 세션
retrospective        # 회고 세션
daily-standup        # 데일리 스탠드업
risk-assessment      # 리스크 평가
```

## 에이전트

| 에이전트 | 패턴 | 역할 |
|----------|------|------|
| `pm-planner` | Plan-and-Execute | 전략적 계획, 스프린트 계획, 에픽 분해 |
| `pm-executor` | ReAct | 적응적 실행, 백로그 정리, 의존성 조사 |
| `pm-reflector` | Reflexion | 자기 개선, 추정 보정, 회고 학습 |
| `ticket-worker` | - | 이슈 구현 |

## Git 통합

### 브랜치 명명
```
PM-123-feature-description
```

### Magic Words (커밋 메시지)
```
fixes PM-123    # 태스크 자동 완료
closes PM-123   # 태스크 자동 완료
refs PM-123     # 태스크 링크 (상태 변경 없음)
```

### 훅
- **PreToolUse(git commit)**: 태스크 링크 검증
- **PostToolUse(git commit)**: 커밋 연결 및 magic word 처리
- **Stop**: 세션 요약 저장

## 토큰 효율화

### 계층적 요약
| Level | 내용 | 트리거 |
|-------|------|--------|
| L0 (Raw) | 개별 업데이트 | N/A |
| L1 (Story) | 스토리 요약 | 20 메시지마다 |
| L2 (Epic) | 에픽 진행 | 주간/마일스톤 |
| L3 (Project) | 프로젝트 헬스 | 세션 경계 |

### 70% 규칙
컨텍스트 70% 도달 전 압축. 압축 후 40-50% 작업 공간 유지.

## 저장소 계층

| Tier | 저장소 | 내용 | 보존 |
|------|--------|------|------|
| Hot | 메모리 | 활성 세션, 최근 출력 | 세션 |
| Warm | SQLite | 히스토리, 스냅샷 | 일~주 |
| Cold | Vector DB | 임베딩, 아카이브 | 영구 |

## 이벤트 타입

```typescript
type TaskEvent =
  | 'TaskCreated'
  | 'TaskStatusChanged'
  | 'TaskEstimated'
  | 'TaskLinkedToCommit'
  | 'TaskAddedToSprint'
  | 'TaskCompleted';
```

## 테스트

### 테스트 구조

| 유형 | 테스트 수 | 설명 |
|------|----------|------|
| 단위/통합 | 525개 | Mock 기반, 빠른 피드백 |
| E2E | 44개 | 실제 GitHub CLI, Git, SQLite |
| **총계** | **569개** | 커버리지 81%+ |

### 실행 방법

```bash
# 단위/통합 테스트
npm test

# E2E 테스트 (실제 API 사용)
npm run test:e2e

# 커버리지 리포트
npm run test:coverage

# E2E 테스트 리소스 강제 정리
npm run test:e2e:cleanup
```

### E2E 테스트

Mock 없이 실제 서비스와 통합 테스트:

- **GitHub CLI**: 이슈 CRUD, 코멘트, 상태 변경
- **Git 명령어**: 브랜치, 커밋 히스토리, 핫스팟 분석
- **파일 기반 SQLite**: 실제 DB 파일 생성/삭제
- **MCP 워크플로우**: 프로젝트 → 태스크 → 스프린트 → 완료

### 요구사항

```bash
# GitHub CLI 인증 (E2E 테스트용)
gh auth login

# 인증 확인
gh auth status
```

> **참고**: API 키 불필요. `gh` CLI 인증만으로 E2E 테스트 실행 가능.

## 디렉토리 구조

```
plugins/pm/
├── .claude-plugin/
│   ├── plugin.json         # 매니페스트
│   └── mcp.json            # MCP 설정
├── mcp/
│   ├── server.ts           # MCP 서버 진입점
│   └── lib/
│       ├── db.ts           # SQLite 래퍼
│       ├── repositories.ts # 리포지토리 레이어
│       └── server-handlers.ts # MCP 핸들러
├── storage/
│   ├── schema.sql          # SQLite 스키마
│   └── lib/events.ts       # 이벤트 소싱
├── agents/
│   ├── pm-planner.md       # Plan-and-Execute
│   ├── pm-executor.md      # ReAct
│   ├── pm-reflector.md     # Reflexion
│   └── ticket-worker.md    # 이슈 구현
├── commands/
│   ├── init.md             # /pm:init
│   ├── task.md             # /pm:task
│   ├── sprint.md           # /pm:sprint
│   └── status.md           # /pm:status
├── skills/pm/
│   ├── SKILL.md            # 스킬 정의
│   └── references/         # 템플릿, 스키마
├── hooks/
│   ├── hooks.json          # 훅 설정
│   └── scripts/            # 훅 스크립트
├── lib/
│   ├── github.ts           # GitHub CLI 래퍼
│   ├── git.ts              # Git 명령어 래퍼
│   └── summarizer.ts       # 토큰 효율화
├── tests/
│   ├── unit/               # 단위 테스트
│   ├── integration/        # 통합 테스트 (Mock 기반)
│   ├── helpers/            # 테스트 헬퍼
│   └── e2e/                # E2E 테스트 (실제 API)
│       ├── config/         # Vitest E2E 설정
│       ├── helpers/        # E2E 헬퍼
│       ├── github/         # GitHub CLI 테스트
│       ├── git/            # Git 명령어 테스트
│       ├── mcp/            # MCP 워크플로우 테스트
│       └── integration/    # 동기화 테스트
├── package.json            # NPM 설정
├── tsconfig.json           # TypeScript 설정
├── ARCHITECTURE.md         # 아키텍처 문서
├── CORE.md                 # 설계 원칙
└── README.md               # 이 문서
```

## 참고 자료

- [CORE.md](./CORE.md) - 설계 원칙 및 연구 기반
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 상세 아키텍처

## 라이선스

MIT

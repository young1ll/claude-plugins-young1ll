---
name: pm
description: |
  AI 기반 프로젝트 관리 스킬.
  MCP 서버를 통한 태스크/스프린트 관리, 이벤트 소싱 기반 추적.
  Plan-and-Execute, ReAct, Reflexion 하이브리드 에이전트 패턴.
---

# Project Management Skill

MCP 통합 프로젝트 관리 스킬. CORE.md 설계 원칙 기반.

## 아키텍처

```
Plan-and-Execute (전략적 계획) → pm-planner
        ↓
    ReAct (적응적 실행) → pm-executor
        ↓
   Reflexion (자기 개선) → pm-reflector
        ↓
    MCP Server (데이터 통합)
        ↓
    SQLite (이벤트 소싱)
```

## /pm:help 출력

**중요**: 사용자가 `/pm:help`를 실행하면 아래 형식을 **정확히 그대로** 출력하세요.

```
📋 PM — AI Project Management v2.0.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MCP 기반 프로젝트 관리. 이벤트 소싱 + 하이브리드 에이전트.

🚀 시작하기
   /pm:init              MCP 통합 프로젝트 초기화

📋 태스크
   /pm:task create       태스크 생성
   /pm:task list         태스크 목록
   /pm:task status       태스크 상태 변경

🏃 스프린트
   /pm:sprint create     스프린트 생성
   /pm:sprint status     스프린트 현황
   /pm:sprint burndown   번다운 차트
   /pm:sprint velocity   속도 분석

📊 대시보드
   /pm:status            전체 현황 대시보드

🤖 에이전트
   pm-planner            Plan-and-Execute (전략적 계획)
   pm-executor           ReAct (적응적 실행)
   pm-reflector          Reflexion (자기 개선)
   ticket-worker         이슈 구현

🔗 Git 통합
   브랜치: PM-123-description
   커밋: fixes PM-123, refs PM-123

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Quick Start
   새 프로젝트   → /pm:init
   태스크 추가  → /pm:task create "태스크명"
   상태 확인    → /pm:status
```

---

## MCP 도구

### Resources (정적)

| URI | 설명 |
|-----|------|
| `pm://schema/task` | 태스크 스키마 |
| `pm://schema/sprint` | 스프린트 스키마 |
| `pm://meta/velocity` | 속도 계산 방법 |
| `pm://docs/conventions` | PM 컨벤션 |

### Tools (동적)

```typescript
// 태스크 CRUD
pm_task_create(title, projectId, type?, priority?, points?)
pm_task_list(filter?)
pm_task_get(taskId)
pm_task_update(taskId, updates)
pm_task_status(taskId, status, reason?)

// 스프린트
pm_sprint_create(name, startDate, endDate, goal?)
pm_sprint_status(sprintId?)
pm_sprint_add_tasks(sprintId, taskIds)

// 분석
pm_velocity_calculate(projectId, sprintCount?)
pm_burndown_data(sprintId)

// Git 통합
pm_link_commit(taskId, commitSha, branch?)
pm_task_from_branch()
```

### Prompts (템플릿)

| Prompt | 설명 |
|--------|------|
| `sprint-planning` | 스프린트 계획 세션 |
| `retrospective` | 회고 세션 |
| `daily-standup` | 데일리 스탠드업 |
| `risk-assessment` | 리스크 평가 |

---

## 명령어

| 명령어 | 설명 |
|--------|------|
| `/pm:help` | 도움말 |
| `/pm:init` | 프로젝트 초기화 |
| `/pm:task <action>` | 태스크 CRUD |
| `/pm:sprint <action>` | 스프린트 관리 |
| `/pm:status` | 대시보드 |

---

## 에이전트 패턴

### pm-planner (Plan-and-Execute)

전략적 계획 수립. 스프린트 계획, 로드맵 생성, 에픽 분해.

```
목표 분석 → 다단계 계획 생성 → 각 단계 실행 → 진행 모니터링
```

### pm-executor (ReAct)

적응적 실행. 백로그 정리, 의존성 조사.

```
Thought → Action → Observation → 반복
```

### pm-reflector (Reflexion)

자기 개선. 추정 보정, 회고 학습.

```
결과 평가 → 언어적 피드백 → 메모리 저장 → 다음 추정 반영
```

---

## 토큰 효율화

### 계층적 요약

| Level | 내용 | 트리거 |
|-------|------|--------|
| L0 | 개별 업데이트 | N/A |
| L1 | 스토리 요약 | 20 메시지 |
| L2 | 에픽 진행 | 주간 |
| L3 | 프로젝트 헬스 | 세션 종료 |

### 70% 규칙

컨텍스트 70% 도달 전 압축. 압축 후 40-50% 작업 공간 유지.

### 컴팩트 포맷

```typescript
// 전체 객체 대신 요약 반환
{ total: 10, byStatus: {...}, points: 34 }
// → 40-50% 토큰 절감
```

---

## Git 통합

### 브랜치 명명

```
PM-123-feature-description
```

### Magic Words

```
fixes PM-123    # 태스크 완료
closes PM-123   # 태스크 완료
refs PM-123     # 링크만 (상태 유지)
```

### 훅

- **PreToolUse(git commit)**: 태스크 링크 검증
- **PostToolUse(git commit)**: 커밋 연결
- **Stop**: 세션 요약 저장

---

## 권장 작업 시스템

모든 명령어 출력 마지막에 권장 작업 안내:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 다음 권장 작업
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. [필수] 블로커 해결
     → pm_task_status(PM-125, "in_progress")

  2. [권장] 번다운 확인
     → /pm:sprint burndown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 우선순위

| 태그 | 의미 |
|------|------|
| `[필수]` | 즉시 해결 필요 |
| `[권장]` | 진행에 도움 |
| `[선택]` | 하면 좋음 |
| `[제안]` | 장기 고려 |

---

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

---

## Resources

- `references/templates/`: 문서 템플릿
- `references/schemas/`: PROJECT.yaml 스키마
- `references/init-guide.md`: 초기화 가이드

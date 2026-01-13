---
description: Sprint management with velocity tracking
argument-hint: <action> [options]
allowed-tools: [pm_sprint_create, pm_sprint_list, pm_sprint_status, pm_sprint_start, pm_sprint_complete, pm_sprint_add_tasks, pm_velocity_calculate, pm_burndown_data]
---

# /pm:sprint

스프린트 관리 및 진행률 추적.

## Usage

```bash
# 생성
/pm:sprint create "Sprint 24" --start 2024-01-15 --end 2024-01-28
/pm:sprint create "Sprint 24" --duration 2w

# 조회
/pm:sprint list
/pm:sprint status
/pm:sprint status SPRINT-1

# 태스크 추가
/pm:sprint add 42 43 44

# 시작/완료
/pm:sprint start
/pm:sprint complete

# 분석
/pm:sprint burndown
/pm:sprint velocity
```

## Actions

### create

```typescript
pm_sprint_create({
  name: string,
  projectId: string,       // PROJECT.yaml에서 자동
  startDate: string,       // YYYY-MM-DD
  endDate: string,
  goal?: string
})
```

### status

```typescript
pm_sprint_status({
  sprintId?: string  // 없으면 활성 스프린트
})
```

### add (tasks)

```typescript
pm_sprint_add_tasks({
  sprintId: string,
  taskIds: string[]
})
```

### start

```typescript
pm_sprint_start({
  sprintId: string
})
```

스프린트 시작 시:
- 상태가 `planning` → `active`로 변경
- 시작 시간 기록
- 번다운 차트 시작점 설정

### complete

```typescript
pm_sprint_complete({
  sprintId: string
})
```

스프린트 완료 시:
- 상태가 `active` → `completed`로 변경
- 미완료 태스크는 다음 스프린트로 이동 제안
- 실제 속도(velocity) 계산

### burndown

```typescript
pm_burndown_data({
  sprintId: string
})
```

### velocity

```typescript
pm_velocity_calculate({
  projectId: string,
  sprintCount?: number  // 기본 3
})
```

## Output Format

### 스프린트 상태

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sprint 23 — Feature Release
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Period: 2024-01-08 → 2024-01-21 (Day 5/14)
Goal: 사용자 인증 시스템 완성

Progress:
   ████████░░░░░░░░ 50% (5/10 tasks)

Points:
   Committed: 34 pts
   Completed: 18 pts (53%)
   Remaining: 16 pts

By Status:
   ✓ Done:        5 tasks (18 pts)
   → In Progress: 2 tasks (8 pts)
   □ Todo:        2 tasks (5 pts)
   ⊘ Blocked:     1 task  (3 pts)

Risks:
   • 블로커 1개: #44 (외부 API 대기)
   • 속도 대비 잔여량 초과 가능

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 번다운 차트

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Burndown — Sprint 23
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Points
34 ┤●
30 ┤ ╲
26 ┤  ╲●
22 ┤   ╲ ●
18 ┤    ╲  ●───●  (actual)
14 ┤     ╲
10 ┤      ╲        (ideal)
 6 ┤       ╲
 2 ┤        ╲
 0 ┼────────────────●
   Day 1  3  5  7  9  11  13

Legend:
  ── Ideal (2.4 pts/day)
  ●● Actual

Status: ⚠ 예상 대비 약간 지연
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Velocity

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Velocity — Last 3 Sprints
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sprint     │ Committed │ Completed │ Rate
───────────┼───────────┼───────────┼──────
Sprint 21  │    32     │    28     │  88%
Sprint 22  │    30     │    32     │ 107%
Sprint 23  │    34     │    18*    │  53%*

* 진행 중

Statistics:
   Average Velocity: 30 pts/sprint
   Std Deviation: ±2.8 pts
   Trend: ↗ 상승

Recommended Commitment (Next Sprint):
   Conservative: 28 pts
   Normal: 30 pts
   Aggressive: 33 pts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Sprint Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Sprint Lifecycle                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Planning ────► Active ────► Completed                              │
│     │             │              │                                  │
│     │             │              │                                  │
│  태스크 추가    태스크 진행    Velocity 계산                        │
│  목표 설정     상태 변경      회고 트리거                           │
│  포인트 확정   번다운 추적    미완료 이월                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## MCP Prompts Integration

```bash
# 스프린트 계획 세션 시작
/pm:sprint plan
# → MCP prompt: sprint-planning

# 회고 세션 시작
/pm:sprint retro
# → MCP prompt: retrospective

# 데일리 스탠드업
/pm:sprint daily
# → MCP prompt: daily-standup
```

## Related

- `/pm:task` - 태스크 관리
- `/pm:status` - 전체 현황

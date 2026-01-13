---
description: Project status dashboard with Git integration
allowed-tools: [pm_task_list, pm_task_board, pm_sprint_status, pm_velocity_calculate, pm_git_stats, pm_git_hotspots, Bash]
---

# /pm:status

Git-First 워크플로우 기반 프로젝트 상태 대시보드.

## Usage

```bash
/pm:status           # 전체 상태
/pm:status sprint    # 현재 스프린트만
/pm:status tasks     # 태스크 목록만
/pm:status git       # Git 상태만
/pm:status velocity  # 속도 분석만
```

## Data Sources

```typescript
// 1. Git 상태
const gitStatus = await Bash("git status --porcelain");
const branch = await Bash("git branch --show-current");

// 2. 활성 스프린트 상태
const sprint = await pm_sprint_status();

// 3. 태스크 요약 (컴팩트)
const tasks = await pm_task_list({ sprintId: sprint.id });

// 4. Velocity 계산
const velocity = await pm_velocity_calculate({ sprintCount: 3 });

// 5. Git 통계 (선택)
const stats = await pm_git_stats({ since: sprint.startDate });
```

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PM Status — {project-name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Git Context:
   ────────────────────────────────────────────────
   Branch: 42-feat-user-auth
   Task:   #42 사용자 인증 구현
   Status: in_progress

   Working Tree:
     M  src/auth/login.ts
     M  src/auth/token.ts
     A  src/auth/middleware.ts

Sprint: Sprint 23 — Feature Release
   ────────────────────────────────────────────────
   Period: 2024-01-08 → 2024-01-21 (Day 5/14)
   Progress: ████████░░░░░░░░ 50% (5/10)
   Points: 18/34 completed

Task Summary:
   ────────────────────────────────────────────────
   Status      │ Count │ Points
   ────────────┼───────┼────────
   ✓ Done      │   5   │   18
   → Progress  │   2   │    8
   □ Todo      │   2   │    5
   ⊘ Blocked   │   1   │    3

Velocity:
   ────────────────────────────────────────────────
   Average: 30 pts/sprint
   Trend: ↗ Increasing
   Prediction: On track ✓

Attention:
   ────────────────────────────────────────────────
   • 1 blocked task: #44 (외부 API 대기)
   • Current branch has uncommitted changes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Recommended Actions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. [필수] 블로커 해결: #44
     → /pm:task status 44 in_progress

  2. [권장] 현재 작업 커밋
     → git commit -m "feat(auth): ..." refs #42

  3. [선택] 번다운 차트 확인
     → /pm:sprint burndown

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Git Only Mode

```bash
/pm:status git
```

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Git Status — {project-name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Branch: 42-feat-user-auth
   Task: #42 사용자 인증 구현 (in_progress)
   Ahead: 3 commits
   Behind: 0 commits

Working Tree:
   M  src/auth/login.ts
   M  src/auth/token.ts
   A  src/auth/middleware.ts

Recent Commits:
   abc1234 feat(auth): add login endpoint
   def5678 feat(auth): add token validation
   ghi9012 test(auth): add unit tests

Sprint Activity:
   Commits this sprint: 12
   Files changed: 24
   Lines +1,234 / -456

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Token Efficiency

대시보드는 컴팩트 포맷 사용:

```typescript
// 전체 태스크 객체 대신 요약 반환
{
  total: 10,
  byStatus: { done: 5, in_progress: 2, todo: 2, blocked: 1 },
  totalPoints: 34,
  completedPoints: 18
}
```

이 방식으로 **40-50% 토큰 절감**.

## Recommended Actions Logic

| 상황 | 권장 작업 |
|------|----------|
| 블로커 존재 | 블로커 해결 우선 |
| Uncommitted changes | 커밋 권장 |
| Branch behind | git pull 권장 |
| 진행률 < 30% | 태스크 시작 독려 |
| 진행률 30-70% | 번다운 확인 |
| 진행률 > 70% | 마무리 집중 |
| 진행률 100% | 회고 제안 |

## Context Detection

브랜치 이름에서 자동으로 태스크 컨텍스트 감지:

```
Branch: 42-feat-user-auth
        │   │    │
        │   │    └── description
        │   └── type (feat/fix/refactor/...)
        └── task ID (#42)
```

자동으로 해당 태스크의 상태와 정보를 함께 표시.

## Related

- `/pm:sprint` - 스프린트 상세
- `/pm:task` - 태스크 관리
- `/pm:task board` - 칸반 보드

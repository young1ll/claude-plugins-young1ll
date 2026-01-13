---
description: Initialize PM project with Git-First workflow
argument-hint: [project-name]
allowed-tools: [Read, Write, Bash, Glob, AskUserQuestion, pm_project_create, pm_task_create]
---

# /pm:init

Git-First 워크플로우 기반 프로젝트 관리 구조를 초기화합니다.

## Prerequisites

- Git 저장소 (또는 초기화됨)
- Node.js 18+ (MCP 서버 실행용)

## Workflow

1. **Git 상태 확인**
   ```bash
   git rev-parse --git-dir  # Git 저장소 확인
   git remote -v            # GitHub 원격 확인
   ```

2. **프로젝트 유형 확인**
   ```
   AskUserQuestion:
   - Backend: API, 서비스, 마이크로서비스
   - Frontend: 웹앱, SPA, 컴포넌트 라이브러리
   - Library: SDK, 패키지, 유틸리티
   - Full-stack: 백엔드 + 프론트엔드
   ```

3. **디렉토리 구조 생성**
   ```
   .claude/
   ├── pm.db              # SQLite 데이터베이스
   └── pm-activity.log    # 세션 활동 로그

   docs/
   ├── MANIFESTO.md       # 프로젝트 비전 (선택)
   └── MILESTONES.md      # 마일스톤/태스크

   PROJECT.yaml           # 프로젝트 설정
   ```

4. **SQLite 스키마 초기화**
   - 이벤트 스토어 테이블 생성
   - 프로젝션 뷰 생성

5. **GitHub 연동 확인** (선택)
   ```bash
   gh repo view --json name,owner
   ```

## PROJECT.yaml 템플릿

```yaml
name: {project-name}
version: 0.1.0

pm:
  db_path: .claude/pm.db
  estimation_unit: points  # points | hours
  velocity_window: 3       # 스프린트 수

# Git-First 설정 (LEVEL_1)
git:
  branch_pattern: "{issue_number}-{type}-{description}"
  types:
    - feat      # 새 기능
    - fix       # 버그 수정
    - refactor  # 리팩토링
    - docs      # 문서
    - test      # 테스트
    - chore     # 빌드/설정
  magic_words:
    fixes: done         # 자동 완료
    closes: done
    refs: null          # 링크만
    wip: in_progress    # 진행 중
    review: in_review   # 리뷰 중
    done: done          # 완료

# GitHub 연동 (선택)
github:
  enabled: false        # true로 변경하면 GitHub Issues 동기화
  owner: ""
  repo: ""
  project_number: null  # GitHub Projects v2 번호

core_docs:
  vision: docs/MANIFESTO.md
  progress: docs/MILESTONES.md

plans_dir: docs/plans
reports_dir: docs/reports
```

## MCP 도구 호출 시퀀스

```typescript
// 1. 프로젝트 생성
const project = await pm_project_create({
  name: "{project-name}",
  description: "프로젝트 설명"
});

// 2. 초기 태스크 생성 (선택)
await pm_task_create({
  projectId: project.id,
  title: "프로젝트 설정 완료",
  type: "task",
  status: "done"
});
```

## Usage

```bash
/pm:init
/pm:init my-project
```

## Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PM Init — {project-name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Git Repository:
   Branch: main
   Remote: origin → github.com/owner/repo

Created:
   PROJECT.yaml
   .claude/pm.db (schema initialized)
   docs/MILESTONES.md

Git-First Config:
   Branch Pattern: {issue_number}-{type}-{description}
   Magic Words: fixes, closes, refs, wip, review, done

Next Steps:
   1. /pm:task create "첫 태스크" --type feat
   2. git checkout -b 1-feat-first-task
   3. /pm:status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Related

- `/pm:task` - 태스크 관리
- `/pm:sprint` - 스프린트 관리
- `/pm:status` - 상태 확인

# PM Plugin Architecture

LEVEL_2 NestJS + Python ML 하이브리드 아키텍처 기반 프로젝트 관리 플러그인.

## 설계 원칙

1. **Git-First**: GitHub Flow 기반 워크플로우
2. **MCP 통합**: Resources/Tools/Prompts 패턴
3. **이벤트 소싱**: 완전한 감사 추적 및 시점별 상태 재구성
4. **모듈화**: NestJS IoC Container 기반 의존성 주입
5. **하이브리드 ML**: TypeScript (비즈니스 로직) + Python (머신러닝)
6. **토큰 효율화**: 계층적 요약, 70% 압축 규칙

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│                    PM Plugin v2.0                           │
├─────────────────────────────────────────────────────────────┤
│  TypeScript (NestJS)                Python (FastMCP)        │
│  ┌────────────────────┐            ┌──────────────────┐    │
│  │  pm-server         │            │  pm-ml-server    │    │
│  │  (30+ MCP Tools)   │            │  (5 ML Tools)    │    │
│  │                    │            │                  │    │
│  │  • Task Management │            │  • Estimation    │    │
│  │  • Sprint Planning │            │  • Hotspot       │    │
│  │  • Git Integration │            │  • Risk Analysis │    │
│  │  • GitHub Sync     │            │  • Retrospective │    │
│  │  • Offline Queue   │            │  • ML Training   │    │
│  └──────────┬─────────┘            └─────────┬────────┘    │
│             │                                 │             │
│             └────────────┬────────────────────┘             │
│                          ▼                                  │
│                  ┌──────────────┐                           │
│                  │   SQLite     │                           │
│                  │   pm.db      │                           │
│                  └──────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

## 디렉토리 구조

```
plugins/pm/
├── .claude-plugin/
│   ├── plugin.json              # 플러그인 매니페스트
│   └── mcp.json                 # 하이브리드 MCP 서버 설정 (pm + pm-ml)
│
├── mcp/                         # NestJS MCP 서버
│   ├── main.ts                  # NestJS 부트스트랩 (~50 lines)
│   ├── app.module.ts            # 루트 모듈 (6 feature modules)
│   │
│   ├── transport/               # Custom MCP Transport Strategy
│   │   ├── mcp.transport.ts     # NestJS ↔ MCP stdio bridge
│   │   └── mcp.types.ts         # MCP 타입 정의
│   │
│   ├── core/                    # 핵심 모듈
│   │   ├── database/
│   │   │   ├── database.module.ts
│   │   │   └── database.service.ts  # DatabaseManager 래핑
│   │   ├── events/
│   │   │   ├── events.module.ts
│   │   │   └── event-store.service.ts
│   │   └── common/
│   │       ├── decorators/
│   │       │   └── mcp-tool.decorator.ts  # @MCPTool()
│   │       ├── filters/
│   │       └── pipes/
│   │
│   ├── modules/                 # 기능 모듈 (6개)
│   │   ├── task/
│   │   │   ├── task.module.ts
│   │   │   ├── task.service.ts      # 비즈니스 로직 + 이벤트 소싱
│   │   │   ├── task.repository.ts   # Legacy TaskRepository 래핑
│   │   │   ├── task.controller.ts   # 6 MCP Tools
│   │   │   └── dto/                 # class-validator DTOs (4개)
│   │   │
│   │   ├── project/             # 2 MCP Tools
│   │   ├── sprint/              # 6 MCP Tools
│   │   ├── git/                 # 7 MCP Tools (Phase 4: Commit, PR)
│   │   ├── github/              # 4 MCP Tools
│   │   └── sync/                # 5 MCP Tools (Phase 5: Offline-first)
│   │
│   ├── lib/                     # Legacy 계층 (점진적 제거 예정)
│   │   ├── db.ts                # DatabaseManager
│   │   ├── projections.ts       # Repository 구현체
│   │   ├── server-helpers.ts    # Git 헬퍼
│   │   └── server-handlers.ts   # 레거시 핸들러
│   │
│   └── server.ts                # Legacy MCP 서버 (2,029 lines → 유지)
│
├── ml/                          # Python ML 서비스
│   ├── pyproject.toml           # Python 프로젝트 설정
│   ├── README.md                # ML 서비스 문서
│   └── pm_ml/
│       ├── server.py            # FastMCP 서버 (5 MCP Tools)
│       ├── estimation/
│       │   ├── model.py         # Random Forest 회귀 모델
│       │   └── features.py      # 피처 엔지니어링
│       ├── analysis/
│       │   ├── hotspots.py      # Git 기반 핫스팟 분석
│       │   └── patterns.py      # NLP 패턴 추출
│       └── db/
│           └── sqlite.py        # SQLite 공유 접근
│
├── storage/                     # 저장소 계층
│   ├── schema.sql               # SQLite 스키마 (commits, pull_requests 활성화)
│   ├── migrations/
│   └── lib/
│       └── events.ts            # EventStore (이벤트 소싱)
│
├── agents/                      # 에이전트 (4개)
├── commands/                    # 슬래시 명령어 (4개)
├── skills/pm/                   # PM 스킬
├── hooks/                       # 이벤트 훅 (7개)
│
├── lib/                         # 공통 유틸리티
│   ├── github.ts                # GitHub CLI 래퍼
│   ├── git.ts                   # Git 명령어 래퍼
│   ├── summarizer.ts            # 토큰 효율화
│   └── sync-engine.ts           # 동기화 엔진
│
├── tests/                       # 테스트 (526개 통과)
│   ├── unit/                    # 단위 테스트
│   ├── integration/             # 통합 테스트
│   ├── helpers/
│   └── e2e/                     # E2E 테스트
│
├── package.json
├── tsconfig.json                # experimentalDecorators, emitDecoratorMetadata
├── vitest.config.ts
└── ARCHITECTURE.md              # 이 문서
```

## NestJS 모듈 구조

### 1. TaskModule (6 MCP Tools)

**구조:**
```typescript
@Module({
  providers: [TaskService, TaskRepository],
  controllers: [TaskController],
  exports: [TaskService],
})
export class TaskModule {}
```

**MCP Tools:**
- `pm_task_create` - 태스크 생성 (이벤트 소싱)
- `pm_task_list` - 태스크 리스트 (필터링)
- `pm_task_update` - 태스크 업데이트
- `pm_task_status_change` - 상태 변경 (이벤트)
- `pm_task_get` - 단일 태스크 조회
- `pm_task_board` - 칸반 보드

**특징:**
- class-validator 기반 입력 검증 (4 DTOs)
- 이벤트 소싱 패턴 유지 (TaskCreated, TaskUpdated, TaskStatusChanged)
- Legacy TaskRepository 래핑

### 2. ProjectModule (2 MCP Tools)

- `pm_project_create` - 프로젝트 생성
- `pm_project_list` - 프로젝트 리스트

### 3. SprintModule (6 MCP Tools)

- `pm_sprint_create` - 스프린트 생성
- `pm_sprint_list` - 스프린트 리스트
- `pm_sprint_status` - 스프린트 상태 (compact 옵션)
- `pm_sprint_start` - 스프린트 시작
- `pm_sprint_complete` - 스프린트 완료 (벨로시티 기록)
- `pm_sprint_add_tasks` - 태스크 추가

### 4. GitModule + Phase 4 (7 MCP Tools)

**Phase 4 구현:** Commit & PR 추적

**새로운 테이블:**
- `commits` - 커밋 기록 (sha, task_id, message, author, branch)
- `pull_requests` - PR 추적 (task_id, number, title, status)

**MCP Tools:**
- `pm_commit_list` - 커밋 리스트 (taskId/branch 필터)
- `pm_commit_get` - 커밋 상세
- `pm_commit_stats` - 커밋 통계
- `pm_pr_create` - PR 생성 및 추적
- `pm_pr_link` - 기존 PR 연결
- `pm_pr_list` - PR 리스트
- `pm_pr_status` - PR 상태 동기화

### 5. GitHubModule (4 MCP Tools)

- `pm_github_status` - GitHub CLI 인증 상태
- `pm_github_issue_create` - 이슈 생성
- `pm_github_issue_link` - 이슈 연결
- `pm_github_config` - 통합 설정 (enable/disable)

### 6. SyncModule + Phase 5 (5 MCP Tools)

**Phase 5 구현:** 오프라인 우선 (Sync Queue)

**MCP Tools:**
- `pm_sync_queue_list` - 큐 리스트 (status 필터)
- `pm_sync_queue_process` - 수동 재시도
- `pm_sync_queue_stats` - 큐 통계
- `pm_sync_queue_clear` - 완료 항목 정리
- `pm_sync_queue_retry` - 실패 항목 재시도

**특징:**
- Exponential backoff (1s, 2s, 4s, 8s, 16s)
- 최대 5회 재시도
- 7일 이상 완료 항목 자동 정리

## Python ML 서비스

### FastMCP 서버 (5 MCP Tools)

**1. pm_ml_predict_estimation**
- Random Forest 기반 스토리 포인트 예측
- 12+ 피처 엔지니어링 (type, priority, complexity, historical avg)
- Confidence 점수 (tree variance 기반)
- Fallback: 규칙 기반 추정 (< 10 tasks)

**2. pm_ml_analyze_risk**
- Git 히스토리 기반 핫스팟 분석
- 리스크 점수 (0-10): commit frequency + churn + file size
- 단일 파일 or 패턴 매칭 (bulk analysis)
- 실행 가능한 권장사항

**3. pm_ml_suggest_buffer**
- 신뢰도 & 복잡도 기반 버퍼 시간 제안
- 불확실성 고려한 계획 수립

**4. pm_ml_analyze_retrospective**
- 감정 분석 (positive/negative/neutral)
- 액션 아이템 추출
- 도구 멘션 감지
- 테마 식별

**5. pm_ml_learning_insights**
- 히스토리 데이터 분석
- 태스크 타입 분포
- 자동 ML 모델 학습 (≥10 tasks)
- 모델 영속성 (~/.claude/pm_ml_model.pkl)

### ML 모델 상세

**알고리즘:** Random Forest Regressor
- n_estimators: 100
- max_depth: 10
- random_state: 42

**피처:**
- Task type (one-hot encoding)
- Priority (1-4)
- Title/description complexity (length, word count)
- Technical keywords count
- Historical average by type
- Is subtask flag

**학습:**
- 자동 학습: ≥10 완료 태스크 + 추정값
- 평가 메트릭: R² score, MAE
- 모델 저장: pickle format

## MCP 통합 설계

### 하이브리드 서버 설정

`.claude-plugin/mcp.json`:
```json
{
  "mcpServers": {
    "pm-server": {
      "command": "npx",
      "args": ["tsx", "${CLAUDE_PLUGIN_ROOT}/mcp/server.ts"],
      "env": {
        "PM_DB_PATH": "${PROJECT_ROOT}/.claude/pm.db"
      }
    },
    "pm-ml": {
      "command": "python",
      "args": ["-m", "pm_ml.server"],
      "cwd": "${CLAUDE_PLUGIN_ROOT}/ml",
      "env": {
        "PM_DB_PATH": "${PROJECT_ROOT}/.claude/pm.db",
        "PYTHONPATH": "${CLAUDE_PLUGIN_ROOT}/ml"
      }
    }
  }
}
```

### Custom MCP Transport Strategy

NestJS는 기본적으로 HTTP 기반이지만, MCP는 stdio를 요구합니다.

**해결책:** Custom Transport Strategy

```typescript
// mcp/transport/mcp.transport.ts
export class MCPTransportStrategy extends CustomTransportStrategy {
  private mcpServer: Server;

  async listen(callback: () => void) {
    // NestJS 앱 컨텍스트 생성
    const app = await NestFactory.createApplicationContext(AppModule);

    // MCP Server 생성 및 stdio 연결
    this.mcpServer = new Server({ name: 'pm-server', version: '2.0.0' });
    const transport = new StdioServerTransport();

    // NestJS 컨트롤러를 MCP 도구로 등록 (reflection)
    this.bindHandlers(app);

    await this.mcpServer.connect(transport);
    callback();
  }
}
```

**장점:**
- NestJS IoC Container 사용 가능
- 의존성 주입, 모듈화, 데코레이터
- stdio MCP 프로토콜 호환

## 이벤트 소싱 패턴

### EventStore

```typescript
// storage/lib/events.ts
export class EventStore {
  append(
    eventType: EventType,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>
  ): BaseEvent;

  getByAggregate(aggregateType: string, aggregateId: string): BaseEvent[];
  getAllEvents(limit?: number): BaseEvent[];
}
```

### Event → Projection 동기화

```typescript
// TaskService.create() 예시
async create(dto: CreateTaskDto) {
  const taskId = randomUUID();

  // 1. 이벤트 생성
  createTaskEvent(eventStore, 'TaskCreated', taskId, {
    title: dto.title,
    projectId: dto.projectId,
    type: dto.type || 'task',
  });

  // 2. Projection 동기화
  const task = this.taskRepository.syncFromEvents(taskId);
  return task;
}
```

**이벤트 타입:**
- TaskCreated, TaskUpdated, TaskStatusChanged, TaskEstimated
- SprintCreated, SprintStarted, SprintCompleted
- ProjectCreated, ProjectUpdated

## 데이터 흐름

### 1. Task 생성 워크플로우

```
User Request
    ↓
TaskController.createTask()
    ↓
TaskService.create()
    ↓
EventStore.append('TaskCreated')
    ↓
TaskRepository.syncFromEvents()
    ↓
SQLite (tasks 테이블)
```

### 2. ML 예측 워크플로우

```
User Request (pm_ml_predict_estimation)
    ↓
Python ML Server (FastMCP)
    ↓
SQLite.query("SELECT * FROM tasks WHERE...")
    ↓
EstimationModel.predict()
    ↓
Feature Extraction (12+ features)
    ↓
Random Forest Prediction
    ↓
Confidence Calculation (tree variance)
    ↓
Return: predicted_points + confidence
```

### 3. Git Hotspot 분석 워크플로우

```
User Request (pm_ml_analyze_risk)
    ↓
Python ML Server
    ↓
Git Commands (log, numstat)
    ↓
Risk Calculation (commits + churn + size)
    ↓
Recommendations Generation
    ↓
Return: risk_score (0-10) + recommendations
```

## 의존성 주입 (NestJS IoC)

### 모듈 간 의존성

```typescript
@Module({
  imports: [TaskModule, ProjectModule],  // TaskModule 사용
  providers: [GitHubService],
  controllers: [GitHubController],
})
export class GitHubModule {}
```

### Controller 주입

```typescript
@Controller()
export class GitHubController {
  constructor(
    private readonly githubService: GitHubService,
    private readonly taskService: TaskService,      // TaskModule에서
    private readonly projectService: ProjectService // ProjectModule에서
  ) {}
}
```

## 입력 검증 (class-validator)

### DTO 예시

```typescript
export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsEnum(['critical', 'high', 'medium', 'low'])
  priority?: 'critical' | 'high' | 'medium' | 'low';

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatePoints?: number;
}
```

**장점:**
- 런타임 타입 검증
- 자동 에러 메시지
- 데코레이터 기반 (선언적)

## 테스트 전략

### 테스트 수

- **Total:** 526 tests
- **Unit:** 470+ tests
- **Integration:** 40+ tests
- **E2E:** 16 tests

### 커버리지

- **Overall:** 81%+
- **Target:** 85%+

### 테스트 실행

```bash
npm test                    # Vitest (unit + integration)
npm run test:e2e           # E2E (GitHub, Git, MCP)
npm run test:coverage      # 커버리지 리포트
```

### NestJS 모듈 테스트

```typescript
describe('TaskService', () => {
  let service: TaskService;
  let repository: TaskRepository;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TaskService, TaskRepository, EventStoreService],
    }).compile();

    service = module.get<TaskService>(TaskService);
  });

  it('should create task with event sourcing', async () => {
    const dto = { title: 'Test', projectId: 'uuid' };
    const task = await service.create(dto);
    expect(task).toBeDefined();
    expect(task.title).toBe('Test');
  });
});
```

## 성능 최적화

### 1. SQLite 최적화

```sql
-- WAL 모드 (Write-Ahead Logging)
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- 인덱스
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_sprint ON tasks(sprint_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_commits_task ON commits(task_id);
```

### 2. ML 모델 캐싱

- 모델 영속성: ~/.claude/pm_ml_model.pkl
- 자동 재학습: ≥10 새로운 완료 태스크

### 3. 토큰 효율화

- 계층적 요약 (70% 압축)
- Compact 포맷 옵션 (sprint status)
- JSON.stringify(data, null, 2) 최소화

## 보안

### 1. 쉘 인젝션 방지 (LEVEL_2 해결)

**Before:**
```typescript
execSync(`git log --author="${author}"`)  // 취약
```

**After:**
```typescript
execFileSync('git', ['log', `--author=${author}`])  // 안전
```

### 2. 입력 검증

- class-validator 모든 DTO
- SQL 파라미터 바인딩 (prepared statements)
- GitHub CLI 명령어 검증

### 3. 환경 변수

- PM_DB_PATH: SQLite 경로
- PYTHONPATH: Python 모듈 경로

## 배포 및 빌드

### TypeScript 빌드

```bash
npm run build       # tsc → dist/
npm run typecheck   # 타입 체크만
```

### Python 설치

```bash
cd ml
pip install -e .    # 개발 모드
pip install -e ".[dev]"  # dev dependencies
```

### 플러그인 활성화

```bash
# Claude Code에서 자동 인식
# .claude-plugin/plugin.json 기반
```

## 마이그레이션 이력

### v1.0.0 → v2.0.0 (LEVEL_2)

**변경 사항:**
1. ✅ NestJS 프레임워크 전체 마이그레이션
2. ✅ 6개 기능 모듈 (Task, Project, Sprint, Git, GitHub, Sync)
3. ✅ Custom MCP Transport Strategy
4. ✅ class-validator 입력 검증
5. ✅ Python ML 서비스 (FastMCP)
6. ✅ Phase 4: Git 추적 강화 (commits, pull_requests)
7. ✅ Phase 5: 오프라인 우선 (sync_queue)

**호환성:**
- Legacy server.ts 유지 (2,029 lines)
- 기존 526 테스트 모두 통과
- 0 TypeScript 에러

**새로운 기능:**
- 30+ TypeScript MCP Tools (NestJS)
- 5 Python ML MCP Tools (FastMCP)
- 총 35+ MCP Tools

## 향후 계획 (LEVEL_3)

### Phase 6: 의존성 관리
- task_dependencies 테이블 활성화
- 의존성 그래프 시각화

### Phase 7: Git 이벤트
- git_events 테이블
- 커밋 자동 기록 (PostToolUse hook)

### Phase 8: Reflexion 강화
- NLP 기반 회고 분석
- 학습 기반 추정 개선

### Phase 9: 성능 최적화
- 쿼리 최적화
- 인메모리 캐싱

### Phase 10: UX 개선
- ANSI 컬러 출력
- 인터랙티브 요소

## 참고 문서

- [LEVEL_0.md](./docs/LEVEL_0.md) - 초기 분석
- [LEVEL_1.md](./docs/LEVEL_1.md) - Git-First 아키텍처
- [LEVEL_2.md](./docs/LEVEL_2.md) - 보안 & 통합 해결
- [LEVEL_3.md](./docs/LEVEL_3.md) - 향후 로드맵
- [ml/README.md](./ml/README.md) - Python ML 서비스

## 메트릭

### 코드 메트릭
- TypeScript Lines: ~8,000 lines
- Python Lines: ~1,200 lines
- Total Tests: 526 (100% pass)
- Coverage: 81%+
- TypeScript Errors: 0

### 아키텍처 메트릭
- NestJS Modules: 8 (2 core + 6 feature)
- MCP Tools: 35+ (30 TS + 5 Python)
- DTOs: 20+ (class-validator)
- Repositories: 8 (NestJS services)

### 데이터베이스
- Tables: 14 active (commits, pull_requests 추가)
- Indexes: 15+
- Events: 12+ types (EventStore)

---

**마지막 업데이트:** 2026-01-15
**버전:** 2.0.0 (LEVEL_2 완료)
**아키텍처:** NestJS + Python ML Hybrid

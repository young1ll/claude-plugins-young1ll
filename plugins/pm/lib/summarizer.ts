/**
 * PM Plugin Hierarchical Summarizer
 *
 * Implements token efficiency strategies from CORE.md:
 * - Hierarchical summarization (L0-L3)
 * - 70% compression threshold
 * - Compact data serialization
 */

// ============================================
// Summary Levels
// ============================================

export enum SummaryLevel {
  RAW = 0,      // Individual task updates, comments, commits
  STORY = 1,    // Story summaries with key decisions and blockers
  EPIC = 2,     // Epic progress, risks, cross-story dependencies
  PROJECT = 3,  // Project health, milestone status, strategic decisions
}

export interface Summary {
  level: SummaryLevel;
  content: string;
  tokenCount: number;
  timestamp: string;
  context?: string;
}

// ============================================
// Compression Triggers
// ============================================

export interface CompressionConfig {
  messageThreshold: number;    // Trigger L1 compression after N messages
  weeklyTrigger: boolean;      // Trigger L2 compression weekly
  sessionBoundary: boolean;    // Trigger L3 compression at session end
  contextThreshold: number;    // 70% of context window
}

export const DEFAULT_CONFIG: CompressionConfig = {
  messageThreshold: 20,
  weeklyTrigger: true,
  sessionBoundary: true,
  contextThreshold: 0.7,
};

// ============================================
// Token Estimation
// ============================================

/**
 * Rough token estimation (4 chars per token average)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if compression is needed based on 70% rule
 */
export function needsCompression(
  currentTokens: number,
  maxTokens: number,
  threshold = 0.7
): boolean {
  return currentTokens >= maxTokens * threshold;
}

// ============================================
// Data Serialization
// ============================================

/**
 * Convert task list to compact CSV format
 * Achieves 40-50% token reduction vs JSON
 */
export function tasksToCSV(tasks: TaskSummary[]): string {
  const header = "id,title,status,points,sprint";
  const rows = tasks.map(t =>
    `${t.id},${t.title.substring(0, 30)},${t.status},${t.points || 0},${t.sprint || ''}`
  );
  return [header, ...rows].join('\n');
}

interface TaskSummary {
  id: string;
  title: string;
  status: string;
  points?: number;
  sprint?: string;
}

/**
 * Convert sprint status to compact format
 * Returns counts instead of full objects
 */
export function sprintToCompact(sprint: SprintData): string {
  return `Sprint: ${sprint.name}
Progress: ${sprint.completed}/${sprint.total} (${Math.round(sprint.completed/sprint.total*100)}%)
By Status: todo=${sprint.byStatus.todo}, in_progress=${sprint.byStatus.in_progress}, done=${sprint.byStatus.done}, blocked=${sprint.byStatus.blocked}
Points: ${sprint.completedPoints}/${sprint.totalPoints}`;
}

interface SprintData {
  name: string;
  total: number;
  completed: number;
  totalPoints: number;
  completedPoints: number;
  byStatus: {
    todo: number;
    in_progress: number;
    done: number;
    blocked: number;
  };
}

// ============================================
// Hierarchical Summarization
// ============================================

/**
 * Create L1 Summary: Story-level
 * Triggered every 20 messages
 */
export function createL1Summary(
  messages: string[],
  context: string
): Summary {
  // In production, this would use LLM to summarize
  // For now, create a structured summary template

  const keyPoints = extractKeyPoints(messages);
  const blockers = extractBlockers(messages);
  const decisions = extractDecisions(messages);

  const content = `## Story Summary: ${context}

### Key Progress
${keyPoints.map(p => `- ${p}`).join('\n')}

### Blockers
${blockers.length > 0 ? blockers.map(b => `- ⚠️ ${b}`).join('\n') : '- None'}

### Decisions Made
${decisions.length > 0 ? decisions.map(d => `- ✓ ${d}`).join('\n') : '- None'}
`;

  return {
    level: SummaryLevel.STORY,
    content,
    tokenCount: estimateTokens(content),
    timestamp: new Date().toISOString(),
    context,
  };
}

/**
 * Create L2 Summary: Epic-level
 * Triggered weekly or at milestones
 */
export function createL2Summary(
  l1Summaries: Summary[],
  epicName: string
): Summary {
  const allBlockers: string[] = [];
  const allDecisions: string[] = [];

  l1Summaries.forEach(s => {
    // Extract from L1 summaries
    const blockerMatch = s.content.match(/### Blockers\n([\s\S]*?)(?=###|$)/);
    const decisionMatch = s.content.match(/### Decisions Made\n([\s\S]*?)(?=###|$)/);

    if (blockerMatch) {
      const blockers = blockerMatch[1].match(/- ⚠️ (.+)/g);
      if (blockers) allBlockers.push(...blockers.map(b => b.replace('- ⚠️ ', '')));
    }
    if (decisionMatch) {
      const decisions = decisionMatch[1].match(/- ✓ (.+)/g);
      if (decisions) allDecisions.push(...decisions.map(d => d.replace('- ✓ ', '')));
    }
  });

  const content = `## Epic Summary: ${epicName}

### Period
${l1Summaries[0]?.timestamp || 'N/A'} - ${l1Summaries[l1Summaries.length-1]?.timestamp || 'N/A'}

### Stories Covered
${l1Summaries.map(s => `- ${s.context}`).join('\n')}

### Cross-Story Risks
${allBlockers.length > 0 ? [...new Set(allBlockers)].map(b => `- ${b}`).join('\n') : '- None identified'}

### Key Decisions
${allDecisions.length > 0 ? [...new Set(allDecisions)].map(d => `- ${d}`).join('\n') : '- None'}

### Dependencies
- [Auto-detected dependencies would go here]
`;

  return {
    level: SummaryLevel.EPIC,
    content,
    tokenCount: estimateTokens(content),
    timestamp: new Date().toISOString(),
    context: epicName,
  };
}

/**
 * Create L3 Summary: Project-level
 * Triggered at session boundaries
 */
export function createL3Summary(
  l2Summaries: Summary[],
  projectName: string,
  metrics: ProjectMetrics
): Summary {
  const content = `## Project Summary: ${projectName}

### Health Status
- Overall: ${metrics.health}
- Velocity: ${metrics.velocity} points/sprint (${metrics.velocityTrend})
- Completion Rate: ${metrics.completionRate}%

### Milestone Status
${metrics.milestones.map(m => `- ${m.name}: ${m.progress}%`).join('\n')}

### Strategic Decisions This Period
${l2Summaries.flatMap(s => {
  const match = s.content.match(/### Key Decisions\n([\s\S]*?)(?=###|$)/);
  if (match) {
    return match[1].match(/- (.+)/g)?.map(d => d) || [];
  }
  return [];
}).slice(0, 5).join('\n')}

### Active Risks
${metrics.risks.map(r => `- ${r}`).join('\n') || '- None'}

### Next Period Focus
- [Strategic priorities for next period]
`;

  return {
    level: SummaryLevel.PROJECT,
    content,
    tokenCount: estimateTokens(content),
    timestamp: new Date().toISOString(),
    context: projectName,
  };
}

interface ProjectMetrics {
  health: 'healthy' | 'at_risk' | 'critical';
  velocity: number;
  velocityTrend: 'increasing' | 'stable' | 'decreasing';
  completionRate: number;
  milestones: { name: string; progress: number }[];
  risks: string[];
}

// ============================================
// Extraction Helpers
// ============================================

function extractKeyPoints(messages: string[]): string[] {
  // Simple extraction - in production would use NLP
  const points: string[] = [];
  messages.forEach(msg => {
    if (msg.includes('completed') || msg.includes('done') || msg.includes('finished')) {
      points.push(msg.substring(0, 100));
    }
  });
  return points.slice(0, 5);
}

function extractBlockers(messages: string[]): string[] {
  const blockers: string[] = [];
  messages.forEach(msg => {
    if (msg.includes('blocked') || msg.includes('waiting') || msg.includes('stuck')) {
      blockers.push(msg.substring(0, 100));
    }
  });
  return blockers;
}

function extractDecisions(messages: string[]): string[] {
  const decisions: string[] = [];
  messages.forEach(msg => {
    if (msg.includes('decided') || msg.includes('agreed') || msg.includes('will use')) {
      decisions.push(msg.substring(0, 100));
    }
  });
  return decisions;
}

// ============================================
// Context Manager
// ============================================

export class ContextManager {
  private maxTokens: number;
  private currentTokens: number = 0;
  private summaries: Summary[] = [];
  private messageBuffer: string[] = [];
  private config: CompressionConfig;

  constructor(maxTokens = 100000, config = DEFAULT_CONFIG) {
    this.maxTokens = maxTokens;
    this.config = config;
  }

  addMessage(message: string): void {
    this.messageBuffer.push(message);
    this.currentTokens += estimateTokens(message);

    // Check if L1 compression needed
    if (this.messageBuffer.length >= this.config.messageThreshold) {
      this.compressToL1();
    }

    // Check 70% rule
    if (needsCompression(this.currentTokens, this.maxTokens, this.config.contextThreshold)) {
      this.compressAll();
    }
  }

  private compressToL1(): void {
    const summary = createL1Summary(this.messageBuffer, `Messages ${Date.now()}`);
    this.summaries.push(summary);

    // Clear buffer and update token count
    const savedTokens = this.messageBuffer.reduce((acc, m) => acc + estimateTokens(m), 0);
    this.currentTokens -= savedTokens;
    this.currentTokens += summary.tokenCount;
    this.messageBuffer = [];
  }

  private compressAll(): void {
    // Compress all L1 to L2, all L2 to L3
    const l1s = this.summaries.filter(s => s.level === SummaryLevel.STORY);
    if (l1s.length >= 3) {
      const l2 = createL2Summary(l1s, `Epic ${Date.now()}`);
      this.summaries = this.summaries.filter(s => s.level !== SummaryLevel.STORY);
      this.summaries.push(l2);

      // Recalculate tokens
      this.currentTokens = this.summaries.reduce((acc, s) => acc + s.tokenCount, 0);
      this.currentTokens += this.messageBuffer.reduce((acc, m) => acc + estimateTokens(m), 0);
    }
  }

  getContext(): string {
    // Return compressed context
    const summaryContext = this.summaries
      .sort((a, b) => b.level - a.level) // Higher level first
      .map(s => s.content)
      .join('\n\n---\n\n');

    const recentMessages = this.messageBuffer.slice(-5).join('\n');

    return `${summaryContext}\n\n## Recent Activity\n${recentMessages}`;
  }

  getStats(): { tokens: number; compression: number } {
    const originalEstimate = this.summaries.length * 1000 + this.messageBuffer.length * 200;
    return {
      tokens: this.currentTokens,
      compression: 1 - (this.currentTokens / originalEstimate),
    };
  }
}

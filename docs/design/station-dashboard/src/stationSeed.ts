// Seed/mock data used by the prototype. Replace with real API data.
// Room/map coordinates are PERCENTAGES of the map viewport (x,y = top-left; w,h = size).

export type LaneStatus = 'AUTH' | 'PENDING' | 'SEALED';
export type TaskStatus = 'RUNNING' | 'QUEUED' | 'BLOCKED' | 'HALTED' | 'DONE';
export type AgentStatus = 'ACTIVE' | 'IDLE' | 'BLOCKED' | 'HALTED' | 'HELD';
export type Grant = { id: string; obj: string; real: string; scope: string }; // obj = in-fiction "placed object" name, real = actual integration
export type Room = { id: string; name: string; sector: string; color: string; desc: string; grants: Grant[]; x?: number; y?: number; w?: number; h?: number; pool?: string[]; keys?: string[] };
export type Agent = { id: string; name: string; role: string; room: string; fuel: number };
export type Lane = { id: string; a: string; b: string; purpose: string; status: LaneStatus };
export type Task = { id: string; title: string; agent: string; status: TaskStatus; p: number; rate: number; note: string };
export type Approval = { id: string; who: string; text: string };

export const ROOMS: Room[] = [
  { id: 'research', name: 'RESEARCH LAB', sector: 'A-1', x: 4, y: 8, w: 28, h: 36, color: 'oklch(0.82 0.12 200)', desc: 'Gathers outside intel and files it into the Research DB.',
    grants: [{ id: 'web', obj: 'RADAR DISH', real: 'Web Access', scope: 'READ' }, { id: 'rdb', obj: 'DATA TERMINAL', real: 'Notion · Research DB', scope: 'WRITE' }],
    pool: ['Survey rest-timer UX patterns', 'Summarize 3 hypertrophy papers', 'Scan App Store reviews'], keys: ['research', 'find', 'look up', 'compare', 'source', 'paper'] },
  { id: 'pm', name: 'PROJECT OPS', sector: 'B-1', x: 68, y: 8, w: 28, h: 36, color: 'oklch(0.78 0.13 300)', desc: 'Keeps the Notion project and task databases true, and ships status.',
    grants: [{ id: 'pdb', obj: 'ARCHIVE CABINET', real: 'Notion · Projects DB', scope: 'READ/WRITE' }, { id: 'tdb', obj: 'MISSION BOARD', real: 'Notion · Tasks DB', scope: 'READ/WRITE' }, { id: 'gmail', obj: 'TRANSMITTER', real: 'Gmail', scope: 'DRAFT ONLY' }],
    pool: ['Groom Sprint 15 backlog', 'Update Projects DB statuses', 'Draft stakeholder email'], keys: ['notion', 'task', 'project', 'status', 'sprint', 'email', 'board', 'backlog'] },
  { id: 'dumbbell', name: 'DR. DUMBBELL BAY', sector: 'C-1', x: 28, y: 68, w: 44, h: 29, color: 'oklch(0.83 0.14 80)', desc: 'Project room for the Dr. Dumbbell strength app: build, review and QA.',
    grants: [{ id: 'github', obj: 'FABRICATOR', real: 'GitHub · dr-dumbbell', scope: 'PR ONLY' }, { id: 'shell', obj: 'REACTOR CONSOLE', real: 'Sandbox Shell', scope: 'EXEC · GATED' }, { id: 'figma', obj: 'BLUEPRINT TABLE', real: 'Figma', scope: 'READ' }],
    pool: ['Fix set-counter rounding bug', 'Add plate calculator', 'Polish workout history view'], keys: ['app', 'dumbbell', 'code', 'build', 'bug', 'screen', 'workout', 'pr', 'fix'] },
];

// The Bridge (Overseer HQ) sits at left:38% top:36% w:24% h:28%.
export const BRIDGE: Room = { id: 'bridge', name: 'BRIDGE', sector: 'HQ', color: 'oklch(0.82 0.12 200)', desc: 'Command deck. The Overseer, a top-level orchestrator agent, dispatches every mission and escalates anything gated to you.', grants: [] };

export const AGENTS: Agent[] = [
  { id: 'scout', name: 'SCOUT', role: 'Researcher', room: 'research', fuel: 72 },
  { id: 'archivist', name: 'ARCHIVIST', role: 'Librarian', room: 'research', fuel: 88 },
  { id: 'foreman', name: 'FOREMAN', role: 'Project Mgr', room: 'pm', fuel: 64 },
  { id: 'herald', name: 'HERALD', role: 'Status Reports', room: 'pm', fuel: 91 },
  { id: 'wrench', name: 'WRENCH', role: 'Builder', room: 'dumbbell', fuel: 47 },
  { id: 'lint', name: 'LINT', role: 'Reviewer', room: 'dumbbell', fuel: 80 },
  { id: 'spotter', name: 'SPOTTER', role: 'QA Tester', room: 'dumbbell', fuel: 58 },
];

// Hallway polylines (orthogonal segments) between room pairs, in map %.
// Key is "a|b"; look up reversed if needed.
export const ROUTES: Record<string, [number, number][]> = {
  'bridge|research': [[38, 40], [32, 40]],
  'bridge|pm': [[62, 40], [68, 40]],
  'bridge|dumbbell': [[50, 64], [50, 68]],
  'research|pm': [[32, 14], [68, 14]],
  'research|dumbbell': [[18, 44], [18, 84], [28, 84]],
  'pm|dumbbell': [[82, 44], [82, 84], [72, 84]],
};

export const LANES: Lane[] = [
      { id: 'L-01', a: 'bridge', b: 'research', purpose: 'Dispatch orders, return briefs', status: 'AUTH' },
      { id: 'L-02', a: 'bridge', b: 'pm', purpose: 'Status digests, approvals', status: 'AUTH' },
      { id: 'L-03', a: 'bridge', b: 'dumbbell', purpose: 'Build tickets, PR reports', status: 'AUTH' },
      { id: 'L-04', a: 'research', b: 'pm', purpose: 'Findings → Notion Projects DB', status: 'AUTH' },
      { id: 'L-05', a: 'research', b: 'dumbbell', purpose: 'Form-cue research → app QA', status: 'PENDING' },
    ];

export const TASKS: Task[] = [
      { id: 'T-101', title: 'Strength-app competitor teardown', agent: 'scout', status: 'RUNNING', p: 64, rate: 2.2, note: 'Web Access' },
      { id: 'T-102', title: 'Tag sources in Research DB', agent: 'archivist', status: 'RUNNING', p: 30, rate: 1.6, note: 'Notion write' },
      { id: 'T-103', title: 'Log teardown in Projects DB', agent: 'foreman', status: 'QUEUED', p: 0, rate: 2.4, note: 'Waiting on L-04' },
      { id: 'T-104', title: 'Weekly status digest', agent: 'herald', status: 'RUNNING', p: 70, rate: 1.8, note: 'Gmail draft' },
      { id: 'T-105', title: 'Build rest-timer screen', agent: 'wrench', status: 'RUNNING', p: 45, rate: 1.4, note: 'PR #48' },
      { id: 'T-106', title: 'Review PR #48', agent: 'lint', status: 'BLOCKED', p: 20, rate: 2, note: 'Needs Shell sign-off' },
      { id: 'T-107', title: 'Validate form cues vs research', agent: 'spotter', status: 'QUEUED', p: 0, rate: 1.8, note: 'Waiting on L-05' },
      { id: 'T-108', title: 'Sprint 14 board cleanup', agent: 'foreman', status: 'DONE', p: 100, rate: 0, note: 'Tasks DB' },
    ];

export const APPROVALS: Approval[] = [
      { id: 'ap1', who: 'LINT · DR. DUMBBELL BAY', text: 'Requesting the REACTOR CONSOLE (Sandbox Shell) to run tests on PR #48. Approve?' },
      { id: 'ap2', who: 'SCOUT · RESEARCH LAB', text: 'Proposing hallway L-05 to DR. DUMBBELL BAY so form-cue research reaches SPOTTER. Authorize?' },
    ];

// agentId -> CHARACTERS index
export const DEFAULT_LOOKS: Record<string, number> = { scout: 0, archivist: 16, foreman: 3, herald: 6, wrench: 5, lint: 14, spotter: 15 };

export const CHATTER: string[] = [
  'All crews reporting in. Hallways clear, traffic nominal.',
  'SCOUT is finishing the competitor teardown. FOREMAN gets it next over L-04.',
  'WRENCH is burning fuel fast in Dr. Dumbbell Bay.',
  'Type an order below and I will route it to the right room.',
];

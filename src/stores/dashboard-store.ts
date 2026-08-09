import { create } from 'zustand'
import type {
  ActivityLogEntry,
  QueueJob,
  WorkflowDefinition,
  WorkflowRunState,
} from '@/shared/types/workflow'

export type DashboardView =
  | 'overview'
  | 'planner'
  | 'workflows'
  | 'selector-lab'
  | 'queue'
  | 'activity'
  | 'settings'
  | 'event-guide'

interface DashboardStore {
  view: DashboardView
  workflows: WorkflowDefinition[]
  run: WorkflowRunState | null
  queue: QueueJob[]
  logs: ActivityLogEntry[]
  selectedWorkflowId: string | null
  setView: (view: DashboardView) => void
  setWorkflows: (workflows: WorkflowDefinition[]) => void
  setRun: (run: WorkflowRunState | null) => void
  setQueue: (queue: QueueJob[]) => void
  setLogs: (logs: ActivityLogEntry[]) => void
  selectWorkflow: (id: string | null) => void
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  view: 'overview',
  workflows: [],
  run: null,
  queue: [],
  logs: [],
  selectedWorkflowId: null,
  setView: (view) => set({ view }),
  setWorkflows: (workflows) => set({ workflows }),
  setRun: (run) => set({ run }),
  setQueue: (queue) => set({ queue }),
  setLogs: (logs) => set({ logs }),
  selectWorkflow: (selectedWorkflowId) => set({ selectedWorkflowId }),
}))

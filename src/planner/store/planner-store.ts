import { create } from 'zustand'
import { temporal } from 'zundo'
import { nanoid } from 'nanoid'
import type {
  AutomationPlan,
  ExecutionCheckpoint,
  PlanTextLibrary,
  PlannerEdge,
  PlannerNode,
  VisualWorkflow,
} from '@/planner/types/plan'
import { getActionById } from '@/planner/actions/catalog'
import { parseNumberedTextList } from '@/planner/engine/text-library'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import { clearDurableWorkflowStore } from '@/engine/copy-store/durable'
import {
  buildPlanExport,
  buildSnippetExport,
  buildWorkflowExport,
  buildWorkspaceExport,
  detectPayload,
  remapPlanBundle,
  remapSnippetIds,
  remapWorkflowIds,
  type AnyExportPayload,
} from '@/planner/io/export-import'

interface PlannerState {
  plans: AutomationPlan[]
  workflows: VisualWorkflow[]
  selectedPlanId: string | null
  selectedWorkflowId: string | null
  selectedNodeId: string | null
  checkpoint: ExecutionCheckpoint | null
  actionQuery: string
  favoriteActionIds: string[]
  dirty: boolean
  saving: boolean
  theme: 'light' | 'dark'
  builderOpen: boolean
  graphRevision: number
  docsActionId: string | null

  hydrate: () => Promise<void>
  setTheme: (theme: 'light' | 'dark') => void
  setActionQuery: (query: string) => void
  toggleFavoriteAction: (actionId: string) => void
  selectPlan: (id: string | null) => void
  selectWorkflow: (id: string | null) => void
  selectNode: (id: string | null) => void
  setBuilderOpen: (open: boolean) => void
  setCheckpoint: (checkpoint: ExecutionCheckpoint | null) => void
  setDocsActionId: (actionId: string | null) => void

  createPlan: (name: string) => Promise<string>
  updatePlan: (
    planId: string,
    patch: Partial<Pick<AutomationPlan, 'name' | 'description' | 'color' | 'tags'>>,
  ) => Promise<void>
  deletePlan: (planId: string) => Promise<boolean>
  createWorkflow: (planId: string, name?: string) => Promise<string>
  updateWorkflowMeta: (
    workflowId: string,
    patch: Partial<Pick<VisualWorkflow, 'name' | 'description' | 'enabled' | 'color' | 'tags'>>,
  ) => Promise<void>
  deleteWorkflow: (workflowId: string) => Promise<boolean>
  duplicateWorkflow: (workflowId: string) => void
  updateWorkflowGraph: (workflowId: string, nodes: PlannerNode[], edges: PlannerEdge[]) => void
  updateNodeData: (workflowId: string, nodeId: string, patch: Partial<PlannerNode['data']>) => void
  addActionNode: (workflowId: string, actionId: string, position: { x: number; y: number }) => string
  removeNode: (workflowId: string, nodeId: string) => void
  duplicateNode: (workflowId: string, nodeId: string) => void
  toggleNodeEnabled: (workflowId: string, nodeId: string) => void
  saveVersion: (workflowId: string, label?: string) => void
  upsertTextLibrary: (
    planId: string,
    args: { id?: string; name: string; rawText: string },
  ) => string
  deleteTextLibrary: (planId: string, libraryId: string) => void
  persist: () => Promise<void>

  exportWorkspacePayload: () => AnyExportPayload
  exportPlanPayload: (planId: string) => AnyExportPayload
  exportWorkflowPayload: (workflowId: string) => AnyExportPayload
  exportSnippetPayload: (workflowId: string, nodeIds?: string[]) => AnyExportPayload
  importPayload: (raw: unknown, mode?: 'replace' | 'merge') => Promise<string>
  exportWorkspace: () => string
  importWorkspace: (json: string) => Promise<void>
}

async function loadWorkspace() {
  const response = await sendRuntimeMessage<{
    ok: boolean
    value: {
      plans: AutomationPlan[]
      workflows: VisualWorkflow[]
      favorites: string[]
      theme: 'light' | 'dark'
    }
  }>({
    type: 'STORAGE_GET',
    payload: {
      key: 'planner-workspace',
      fallback: { plans: [], workflows: [], favorites: [], theme: 'light' },
    },
  })
  return response.value
}

export const usePlannerStore = create<PlannerState>()(
  temporal(
    (set, get) => ({
      plans: [],
      workflows: [],
      selectedPlanId: null,
      selectedWorkflowId: null,
      selectedNodeId: null,
      checkpoint: null,
      actionQuery: '',
      favoriteActionIds: [],
      dirty: false,
      saving: false,
      theme: 'light',
      builderOpen: false,
      graphRevision: 0,
      docsActionId: null,

      hydrate: async () => {
        const data = await loadWorkspace()
        const plans = (data.plans ?? []).map((plan) => ({
          ...plan,
          textLibraries: plan.textLibraries ?? [],
        }))
        set({
          plans,
          workflows: data.workflows ?? [],
          favoriteActionIds: data.favorites ?? [],
          theme: data.theme ?? 'light',
          selectedPlanId: plans[0]?.id ?? null,
          selectedWorkflowId: data.workflows?.[0]?.id ?? null,
          dirty: false,
          graphRevision: 0,
        })
        document.documentElement.classList.toggle('dark', (data.theme ?? 'light') === 'dark')
      },

      setTheme: (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        set({ theme, dirty: true })
        void get().persist()
      },

      setActionQuery: (actionQuery) => set({ actionQuery }),
      toggleFavoriteAction: (actionId) => {
        const current = get().favoriteActionIds
        const favoriteActionIds = current.includes(actionId)
          ? current.filter((id) => id !== actionId)
          : [...current, actionId]
        set({ favoriteActionIds, dirty: true })
      },
      selectPlan: (selectedPlanId) => set({ selectedPlanId }),
      selectWorkflow: (selectedWorkflowId) => set({ selectedWorkflowId, selectedNodeId: null }),
      selectNode: (selectedNodeId) => set({ selectedNodeId }),
      setBuilderOpen: (builderOpen) => set({ builderOpen }),
      setCheckpoint: (checkpoint) => set({ checkpoint }),
      setDocsActionId: (docsActionId) => set({ docsActionId }),

      createPlan: async (name) => {
        const planId = `plan_${nanoid(8)}`
        const workflowId = `vwf_${nanoid(8)}`
        const now = new Date().toISOString()
        const plan: AutomationPlan = {
          id: planId,
          name,
          description: '',
          tags: [],
          workflowIds: [workflowId],
          textLibraries: [],
          createdAt: now,
          updatedAt: now,
        }
        const workflow: VisualWorkflow = {
          id: workflowId,
          planId,
          name: `${name} · Main`,
          enabled: true,
          tags: [],
          variables: {},
          nodes: [
            {
              id: 'n_start',
              type: 'start',
              position: { x: 80, y: 160 },
              data: {
                actionId: 'flow.start',
                label: 'Start',
                enabled: true,
                collapsed: false,
                favorite: false,
                params: {},
                timeoutMs: 5000,
              },
            },
            {
              id: 'n_end',
              type: 'end',
              position: { x: 420, y: 160 },
              data: {
                actionId: 'flow.end',
                label: 'End',
                enabled: true,
                collapsed: false,
                favorite: false,
                params: {},
                timeoutMs: 5000,
              },
            },
          ],
          edges: [{ id: 'e_start_end', source: 'n_start', target: 'n_end', sourceHandle: 'out' }],
          viewport: { x: 0, y: 0, zoom: 1 },
          versions: [],
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          plans: [plan, ...state.plans],
          workflows: [workflow, ...state.workflows],
          selectedPlanId: planId,
          selectedWorkflowId: workflowId,
          dirty: true,
          builderOpen: true,
        }))
        await get().persist()
        return planId
      },

      updatePlan: async (planId, patch) => {
        const now = new Date().toISOString()
        set((state) => ({
          dirty: true,
          plans: state.plans.map((plan) =>
            plan.id !== planId
              ? plan
              : {
                  ...plan,
                  ...patch,
                  name: patch.name !== undefined ? patch.name.trim() || plan.name : plan.name,
                  updatedAt: now,
                },
          ),
        }))
        await get().persist()
      },

      deletePlan: async (planId) => {
        const checkpoint = get().checkpoint
        if (
          checkpoint &&
          checkpoint.planId === planId &&
          (checkpoint.status === 'running' || checkpoint.status === 'paused' || checkpoint.status === 'waiting')
        ) {
          window.alert('Cannot delete this plan while a workflow is running or paused. Pause/Cancel first.')
          return false
        }
        const plan = get().plans.find((item) => item.id === planId)
        if (!plan) return false
        if (!window.confirm(`Delete plan “${plan.name}” and its ${plan.workflowIds.length} workflow(s)?`)) {
          return false
        }
        const removeIds = new Set(plan.workflowIds)
        set((state) => {
          const plans = state.plans.filter((item) => item.id !== planId)
          const workflows = state.workflows.filter((wf) => !removeIds.has(wf.id) && wf.planId !== planId)
          const selectedPlanId =
            state.selectedPlanId === planId ? (plans[0]?.id ?? null) : state.selectedPlanId
          const selectedWorkflowId =
            state.selectedWorkflowId && removeIds.has(state.selectedWorkflowId)
              ? (workflows.find((wf) => wf.planId === selectedPlanId)?.id ?? workflows[0]?.id ?? null)
              : state.selectedWorkflowId
          return {
            plans,
            workflows,
            selectedPlanId,
            selectedWorkflowId,
            selectedNodeId: null,
            dirty: true,
            builderOpen: state.builderOpen && selectedWorkflowId ? state.builderOpen : false,
          }
        })
        await get().persist()
        for (const id of removeIds) {
          void clearDurableWorkflowStore(id)
        }
        return true
      },

      createWorkflow: async (planId, name) => {
        const plan = get().plans.find((item) => item.id === planId)
        if (!plan) throw new Error('Plan not found')
        const workflowId = `vwf_${nanoid(8)}`
        const now = new Date().toISOString()
        const workflow: VisualWorkflow = {
          id: workflowId,
          planId,
          name: (name?.trim() || `${plan.name} · Workflow ${plan.workflowIds.length + 1}`),
          enabled: true,
          tags: [],
          variables: {},
          nodes: [
            {
              id: 'n_start',
              type: 'start',
              position: { x: 80, y: 160 },
              data: {
                actionId: 'flow.start',
                label: 'Start',
                enabled: true,
                collapsed: false,
                favorite: false,
                params: {},
                timeoutMs: 5000,
              },
            },
            {
              id: 'n_end',
              type: 'end',
              position: { x: 420, y: 160 },
              data: {
                actionId: 'flow.end',
                label: 'End',
                enabled: true,
                collapsed: false,
                favorite: false,
                params: {},
                timeoutMs: 5000,
              },
            },
          ],
          edges: [{ id: 'e_start_end', source: 'n_start', target: 'n_end', sourceHandle: 'out' }],
          viewport: { x: 0, y: 0, zoom: 1 },
          versions: [],
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          dirty: true,
          workflows: [workflow, ...state.workflows],
          plans: state.plans.map((item) =>
            item.id === planId
              ? {
                  ...item,
                  workflowIds: [...item.workflowIds, workflowId],
                  updatedAt: now,
                }
              : item,
          ),
          selectedWorkflowId: workflowId,
        }))
        await get().persist()
        return workflowId
      },

      updateWorkflowMeta: async (workflowId, patch) => {
        const now = new Date().toISOString()
        set((state) => ({
          dirty: true,
          workflows: state.workflows.map((wf) =>
            wf.id !== workflowId
              ? wf
              : {
                  ...wf,
                  ...patch,
                  name: patch.name !== undefined ? patch.name.trim() || wf.name : wf.name,
                  updatedAt: now,
                },
          ),
        }))
        await get().persist()
      },

      deleteWorkflow: async (workflowId) => {
        const workflow = get().workflows.find((wf) => wf.id === workflowId)
        if (!workflow) return false
        const checkpoint = get().checkpoint
        if (
          checkpoint &&
          checkpoint.workflowId === workflowId &&
          (checkpoint.status === 'running' || checkpoint.status === 'paused' || checkpoint.status === 'waiting')
        ) {
          window.alert('Cannot delete a running or paused workflow. Cancel or finish it first.')
          return false
        }
        const siblings = get().workflows.filter((wf) => wf.planId === workflow.planId)
        if (siblings.length <= 1) {
          window.alert('A plan needs at least one workflow. Delete the plan instead, or add another workflow first.')
          return false
        }
        if (!window.confirm(`Delete workflow “${workflow.name}”?`)) return false
        set((state) => {
          const workflows = state.workflows.filter((wf) => wf.id !== workflowId)
          const plans = state.plans.map((plan) =>
            plan.id !== workflow.planId
              ? plan
              : {
                  ...plan,
                  workflowIds: plan.workflowIds.filter((id) => id !== workflowId),
                  updatedAt: new Date().toISOString(),
                },
          )
          const selectedWorkflowId =
            state.selectedWorkflowId === workflowId
              ? (workflows.find((wf) => wf.planId === workflow.planId)?.id ?? null)
              : state.selectedWorkflowId
          return {
            workflows,
            plans,
            selectedWorkflowId,
            selectedNodeId: null,
            dirty: true,
          }
        })
        await get().persist()
        void clearDurableWorkflowStore(workflowId)
        return true
      },

      upsertTextLibrary: (planId, args) => {
        const now = new Date().toISOString()
        const parsed = parseNumberedTextList(args.rawText)
        const existing = get().plans.find((plan) => plan.id === planId)?.textLibraries ?? []
        const previous = args.id ? existing.find((lib) => lib.id === args.id) : undefined
        const libraryId = args.id ?? `lib_${nanoid(8)}`

        const items = parsed.map((row, index) => {
          const prev = previous?.items[index]
          const sameTitle = prev && prev.title === row.title
          return {
            id: sameTitle ? prev.id : `ti_${nanoid(6)}`,
            title: row.title,
            text: row.text,
          }
        })

        const library: PlanTextLibrary = {
          id: libraryId,
          name: args.name.trim() || 'untitled list',
          items,
          updatedAt: now,
        }

        set((state) => ({
          dirty: true,
          plans: state.plans.map((plan) => {
            if (plan.id !== planId) return plan
            const libs = plan.textLibraries ?? []
            const exists = libs.some((item) => item.id === libraryId)
            return {
              ...plan,
              textLibraries: exists
                ? libs.map((item) => (item.id === libraryId ? library : item))
                : [...libs, library],
              updatedAt: now,
            }
          }),
        }))
        void get().persist()
        return libraryId
      },

      deleteTextLibrary: (planId, libraryId) => {
        set((state) => ({
          dirty: true,
          plans: state.plans.map((plan) =>
            plan.id !== planId
              ? plan
              : {
                  ...plan,
                  textLibraries: (plan.textLibraries ?? []).filter((lib) => lib.id !== libraryId),
                  updatedAt: new Date().toISOString(),
                },
          ),
        }))
        void get().persist()
      },

      duplicateWorkflow: (workflowId) => {
        const source = get().workflows.find((wf) => wf.id === workflowId)
        if (!source) return
        const copy: VisualWorkflow = {
          ...structuredClone(source),
          id: `vwf_${nanoid(8)}`,
          name: `${source.name} Copy`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set((state) => ({
          workflows: [copy, ...state.workflows],
          plans: state.plans.map((plan) =>
            plan.id === source.planId
              ? { ...plan, workflowIds: [...plan.workflowIds, copy.id], updatedAt: copy.updatedAt }
              : plan,
          ),
          selectedWorkflowId: copy.id,
          dirty: true,
        }))
        void get().persist()
      },

      updateWorkflowGraph: (workflowId, nodes, edges) => {
        // Position/edge autosave — do not bump graphRevision (avoids canvas reload loops)
        set((state) => ({
          dirty: true,
          workflows: state.workflows.map((wf) =>
            wf.id === workflowId
              ? { ...wf, nodes, edges, updatedAt: new Date().toISOString() }
              : wf,
          ),
        }))
      },

      updateNodeData: (workflowId, nodeId, patch) => {
        set((state) => ({
          dirty: true,
          workflows: state.workflows.map((wf) =>
            wf.id !== workflowId
              ? wf
              : {
                  ...wf,
                  updatedAt: new Date().toISOString(),
                  nodes: wf.nodes.map((node) =>
                    node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node,
                  ),
                },
          ),
        }))
        // Keep canvas label/params in sync without full remount
        // graphRevision intentionally not bumped (avoids jump while typing)
      },

      addActionNode: (workflowId, actionId, position) => {
        const action = getActionById(actionId)
        const id = `n_${nanoid(8)}`
        const defaults = Object.fromEntries(
          (action?.fields ?? [])
            .filter((field) => field.defaultValue !== undefined)
            .map((field) => [field.key, field.defaultValue]),
        )
        const node: PlannerNode = {
          id,
          type: actionId === 'flow.start' ? 'start' : actionId === 'flow.end' ? 'end' : 'action',
          position,
          data: {
            actionId,
            label: action?.name ?? actionId,
            enabled: true,
            collapsed: false,
            favorite: false,
            color: action?.color,
            params: defaults,
            timeoutMs: 30_000,
          },
        }
        set((state) => ({
          dirty: true,
          selectedNodeId: id,
          graphRevision: state.graphRevision + 1,
          workflows: state.workflows.map((wf) =>
            wf.id === workflowId
              ? { ...wf, nodes: [...wf.nodes, node], updatedAt: new Date().toISOString() }
              : wf,
          ),
        }))
        return id
      },

      removeNode: (workflowId, nodeId) => {
        set((state) => ({
          dirty: true,
          graphRevision: state.graphRevision + 1,
          selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
          workflows: state.workflows.map((wf) =>
            wf.id !== workflowId
              ? wf
              : {
                  ...wf,
                  nodes: wf.nodes.filter((node) => node.id !== nodeId),
                  edges: wf.edges.filter(
                    (edge) => edge.source !== nodeId && edge.target !== nodeId,
                  ),
                  updatedAt: new Date().toISOString(),
                },
          ),
        }))
      },

      duplicateNode: (workflowId, nodeId) => {
        const wf = get().workflows.find((item) => item.id === workflowId)
        const source = wf?.nodes.find((node) => node.id === nodeId)
        if (!source) return
        const copy: PlannerNode = {
          ...structuredClone(source),
          id: `n_${nanoid(8)}`,
          position: { x: source.position.x + 40, y: source.position.y + 40 },
          selected: false,
        }
        set((state) => ({
          dirty: true,
          graphRevision: state.graphRevision + 1,
          selectedNodeId: copy.id,
          workflows: state.workflows.map((item) =>
            item.id === workflowId
              ? { ...item, nodes: [...item.nodes, copy], updatedAt: new Date().toISOString() }
              : item,
          ),
        }))
      },

      toggleNodeEnabled: (workflowId, nodeId) => {
        const wf = get().workflows.find((item) => item.id === workflowId)
        const node = wf?.nodes.find((item) => item.id === nodeId)
        if (!node) return
        get().updateNodeData(workflowId, nodeId, { enabled: !node.data.enabled })
      },

      saveVersion: (workflowId, label) => {
        set((state) => ({
          dirty: true,
          workflows: state.workflows.map((wf) =>
            wf.id !== workflowId
              ? wf
              : {
                  ...wf,
                  versions: [
                    {
                      id: `ver_${nanoid(6)}`,
                      label: label ?? `Version ${wf.versions.length + 1}`,
                      createdAt: new Date().toISOString(),
                      nodes: structuredClone(wf.nodes),
                      edges: structuredClone(wf.edges),
                    },
                    ...wf.versions,
                  ].slice(0, 30),
                  updatedAt: new Date().toISOString(),
                },
          ),
        }))
      },

      persist: async () => {
        set({ saving: true })
        const { plans, workflows, favoriteActionIds, theme } = get()
        await sendRuntimeMessage({
          type: 'STORAGE_SET',
          payload: {
            key: 'planner-workspace',
            value: {
              plans,
              workflows,
              favorites: favoriteActionIds,
              theme,
              updatedAt: new Date().toISOString(),
            },
          },
        })
        set({ saving: false, dirty: false })
      },

      exportWorkspacePayload: () => {
        const { plans, workflows, favoriteActionIds, theme } = get()
        return buildWorkspaceExport({
          plans,
          workflows,
          favorites: favoriteActionIds,
          theme,
        })
      },

      exportPlanPayload: (planId) => {
        const plan = get().plans.find((item) => item.id === planId)
        if (!plan) throw new Error('Plan not found')
        return buildPlanExport(plan, get().workflows)
      },

      exportWorkflowPayload: (workflowId) => {
        const workflow = get().workflows.find((item) => item.id === workflowId)
        if (!workflow) throw new Error('Workflow not found')
        return buildWorkflowExport(workflow)
      },

      exportSnippetPayload: (workflowId, nodeIds) => {
        const workflow = get().workflows.find((item) => item.id === workflowId)
        if (!workflow) throw new Error('Workflow not found')
        const selected = nodeIds?.length
          ? workflow.nodes.filter((node) => nodeIds.includes(node.id))
          : workflow.nodes
        if (selected.length === 0) throw new Error('No steps to export')
        return buildSnippetExport({
          name: `${workflow.name} snippet`,
          nodes: selected,
          edges: workflow.edges,
          variables: workflow.variables,
        })
      },

      importPayload: async (raw, mode = 'merge') => {
        const payload = detectPayload(raw)

        if (payload.kind === 'workspace') {
          if (mode === 'replace') {
            set({
              plans: payload.plans,
              workflows: payload.workflows,
              favoriteActionIds: payload.favorites ?? get().favoriteActionIds,
              theme: payload.theme ?? get().theme,
              selectedPlanId: payload.plans[0]?.id ?? null,
              selectedWorkflowId: payload.workflows[0]?.id ?? null,
              dirty: true,
              graphRevision: get().graphRevision + 1,
            })
          } else {
            const bundled = payload.plans.map((plan) => {
              const related = payload.workflows.filter(
                (wf) => wf.planId === plan.id || plan.workflowIds.includes(wf.id),
              )
              return remapPlanBundle(plan, related)
            })
            const plans = bundled.map((item) => item.plan)
            const workflows = bundled.flatMap((item) => item.workflows)
            set((state) => ({
              plans: [...plans, ...state.plans],
              workflows: [...workflows, ...state.workflows],
              selectedPlanId: plans[0]?.id ?? state.selectedPlanId,
              selectedWorkflowId: workflows[0]?.id ?? state.selectedWorkflowId,
              dirty: true,
              graphRevision: state.graphRevision + 1,
            }))
          }
          await get().persist()
          return 'Workspace imported'
        }

        if (payload.kind === 'plan') {
          const { plan, workflows } = remapPlanBundle(payload.plan, payload.workflows)
          set((state) => ({
            plans: [plan, ...state.plans],
            workflows: [...workflows, ...state.workflows],
            selectedPlanId: plan.id,
            selectedWorkflowId: workflows[0]?.id ?? null,
            dirty: true,
            graphRevision: state.graphRevision + 1,
          }))
          await get().persist()
          return `Plan imported: ${plan.name}`
        }

        if (payload.kind === 'workflow') {
          const targetPlanId = get().selectedPlanId ?? get().plans[0]?.id
          if (!targetPlanId) throw new Error('Create a plan first, then import workflow')
          const workflow = remapWorkflowIds(payload.workflow, targetPlanId)
          set((state) => ({
            workflows: [workflow, ...state.workflows],
            plans: state.plans.map((plan) =>
              plan.id === targetPlanId
                ? {
                    ...plan,
                    workflowIds: [...plan.workflowIds, workflow.id],
                    updatedAt: new Date().toISOString(),
                  }
                : plan,
            ),
            selectedWorkflowId: workflow.id,
            dirty: true,
            graphRevision: state.graphRevision + 1,
          }))
          await get().persist()
          return `Workflow imported: ${workflow.name}`
        }

        if (payload.kind === 'snippet') {
          const workflowId = get().selectedWorkflowId
          if (!workflowId) throw new Error('Open a workflow first to import a snippet')
          const remapped = remapSnippetIds(payload.nodes, payload.edges)
          set((state) => ({
            dirty: true,
            graphRevision: state.graphRevision + 1,
            workflows: state.workflows.map((wf) =>
              wf.id !== workflowId
                ? wf
                : {
                    ...wf,
                    nodes: [...wf.nodes, ...remapped.nodes],
                    edges: [...wf.edges, ...remapped.edges],
                    variables: { ...wf.variables, ...(payload.variables ?? {}) },
                    updatedAt: new Date().toISOString(),
                  },
            ),
          }))
          await get().persist()
          return `Snippet imported (${remapped.nodes.length} steps)`
        }

        if (payload.kind === 'legacy-workflow') {
          throw new Error('Legacy workflow JSON belongs in Workflows page import')
        }

        throw new Error('Unsupported payload')
      },

      exportWorkspace: () => JSON.stringify(get().exportWorkspacePayload(), null, 2),

      importWorkspace: async (json) => {
        await get().importPayload(JSON.parse(json), 'replace')
      },
    }),
    {
      partialize: (state) => ({
        plans: state.plans,
        workflows: state.workflows,
      }),
      limit: 50,
    },
  ),
)

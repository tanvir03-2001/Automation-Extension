import { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, ListPlus, Pencil, Play, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useDashboardStore } from '@/stores/dashboard-store'
import { enqueueWorkflow, startWorkflow } from '@/dashboard/api/extension-api'
import { sendRuntimeMessage } from '@/shared/messaging/bus'
import {
  buildLegacyWorkflowExport,
  detectPayload,
  downloadJson,
  pickJsonFile,
  readJsonFile,
} from '@/planner/io/export-import'
import type { WorkflowDefinition } from '@/shared/types/workflow'
import { nanoid } from 'nanoid'

function createBlankWorkflow(name: string): WorkflowDefinition {
  const now = new Date().toISOString()
  return {
    id: `wf_${nanoid(8)}`,
    name,
    description: '',
    version: '1.0.0',
    tags: [],
    variables: {},
    createdAt: now,
    updatedAt: now,
    steps: [
      {
        id: `step_${nanoid(6)}`,
        type: 'wait_ms',
        name: 'Wait',
        enabled: true,
        timeoutMs: 5000,
        continueOnError: false,
        params: { ms: 500 },
      },
    ],
  }
}

export function WorkflowsView() {
  const workflows = useDashboardStore((s) => s.workflows)
  const selectedWorkflowId = useDashboardStore((s) => s.selectedWorkflowId)
  const selectWorkflow = useDashboardStore((s) => s.selectWorkflow)
  const setWorkflows = useDashboardStore((s) => s.setWorkflows)
  const run = useDashboardStore((s) => s.run)
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('New Workflow')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingDescription, setEditingDescription] = useState('')

  const startMutation = useMutation({
    mutationFn: startWorkflow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['run'] })
    },
  })

  async function persistWorkflows(next: WorkflowDefinition[]) {
    setWorkflows(next)
    await sendRuntimeMessage({
      type: 'STORAGE_SET',
      payload: { key: 'workflows', value: next },
    })
    void queryClient.invalidateQueries({ queryKey: ['workflows'] })
  }

  async function addWorkflow() {
    const workflow = createBlankWorkflow(newName.trim() || 'Untitled Workflow')
    await persistWorkflows([workflow, ...workflows])
    selectWorkflow(workflow.id)
    setNewName('New Workflow')
  }

  async function saveEdit(workflowId: string) {
    const next = workflows.map((workflow) =>
      workflow.id !== workflowId
        ? workflow
        : {
            ...workflow,
            name: editingName.trim() || workflow.name,
            description: editingDescription,
            updatedAt: new Date().toISOString(),
          },
    )
    await persistWorkflows(next)
    setEditingId(null)
  }

  async function removeWorkflow(workflowId: string) {
    const workflow = workflows.find((item) => item.id === workflowId)
    if (!workflow) return
    if (
      run &&
      run.workflowId === workflowId &&
      (run.status === 'running' || run.status === 'paused' || run.status === 'queued')
    ) {
      window.alert('Cannot delete a running, paused, or queued workflow. Cancel it first.')
      return
    }
    if (!window.confirm(`Delete workflow “${workflow.name}”?`)) return
    const next = workflows.filter((item) => item.id !== workflowId)
    await persistWorkflows(next)
    if (selectedWorkflowId === workflowId) {
      selectWorkflow(next[0]?.id ?? null)
    }
  }

  function exportSelected() {
    const workflow = workflows.find((item) => item.id === selectedWorkflowId) ?? workflows[0]
    if (!workflow) return
    downloadJson(`legacy-workflow-${workflow.id}.json`, buildLegacyWorkflowExport(workflow))
  }

  function exportAll() {
    downloadJson('legacy-workflows.json', {
      kind: 'legacy-workflow-bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      workflows,
    })
  }

  async function importJson() {
    const file = await pickJsonFile()
    if (!file) return
    const raw = await readJsonFile(file)

    if (raw && typeof raw === 'object' && Array.isArray((raw as { workflows?: unknown }).workflows)) {
      const bundle = raw as { workflows: WorkflowDefinition[] }
      const imported = bundle.workflows.map((workflow) => ({
        ...workflow,
        id: `wf_${nanoid(8)}`,
        name: `${workflow.name} (imported)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
      await persistWorkflows([...imported, ...workflows])
      return
    }

    const payload = detectPayload(raw)
    if (payload.kind !== 'legacy-workflow') {
      window.alert('This JSON is a Planner plan/snippet. Import it from Planner → Import/Export.')
      return
    }

    const workflow: WorkflowDefinition = {
      ...payload.workflow,
      id: `wf_${nanoid(8)}`,
      name: `${payload.workflow.name} (imported)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await persistWorkflows([workflow, ...workflows])
    selectWorkflow(workflow.id)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Workflows</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Existing step workflows. Import/export single or multiple JSON plans anytime.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void importJson()}>
            <Upload className="h-3.5 w-3.5" />
            Import JSON
          </Button>
          <Button size="sm" variant="outline" onClick={exportSelected} disabled={workflows.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Export selected
          </Button>
          <Button size="sm" variant="outline" onClick={exportAll} disabled={workflows.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Export all
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/80 bg-card p-4 shadow-panel">
        <label className="min-w-[220px] flex-1 space-y-1">
          <span className="text-xs font-medium">Add workflow</span>
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} />
        </label>
        <Button size="sm" onClick={() => void addWorkflow()}>
          <Plus className="h-3.5 w-3.5" />
          Create
        </Button>
      </div>

      <div className="grid gap-3">
        {workflows.map((workflow, index) => {
          const active = workflow.id === selectedWorkflowId
          const editing = editingId === workflow.id
          return (
            <motion.article
              key={workflow.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              onClick={() => selectWorkflow(workflow.id)}
              className={`cursor-pointer rounded-2xl border p-5 transition-colors ${
                active
                  ? 'border-primary/40 bg-primary/5 shadow-panel'
                  : 'border-border/80 bg-card hover:bg-accent/60'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
                      <Input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        placeholder="Workflow name"
                      />
                      <Input
                        value={editingDescription}
                        onChange={(event) => setEditingDescription(event.target.value)}
                        placeholder="Description"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void saveEdit(workflow.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className="font-display text-lg font-semibold">{workflow.name}</h2>
                      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                        {workflow.description}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      startMutation.mutate(workflow)
                    }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation()
                      void enqueueWorkflow(workflow.id).then(() =>
                        queryClient.invalidateQueries({ queryKey: ['queue'] }),
                      )
                    }}
                  >
                    <ListPlus className="h-3.5 w-3.5" />
                    Queue
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation()
                      setEditingId(workflow.id)
                      setEditingName(workflow.name)
                      setEditingDescription(workflow.description ?? '')
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation()
                      void removeWorkflow(workflow.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation()
                      downloadJson(
                        `legacy-workflow-${workflow.id}.json`,
                        buildLegacyWorkflowExport(workflow),
                      )
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    JSON
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {workflow.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
                <Badge variant="outline">{workflow.steps.length} steps</Badge>
                <Badge variant="outline">v{workflow.version}</Badge>
              </div>
            </motion.article>
          )
        })}
      </div>
    </div>
  )
}

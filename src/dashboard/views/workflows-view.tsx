import { motion } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, ListPlus, Play, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

export function WorkflowsView() {
  const workflows = useDashboardStore((s) => s.workflows)
  const selectedWorkflowId = useDashboardStore((s) => s.selectedWorkflowId)
  const selectWorkflow = useDashboardStore((s) => s.selectWorkflow)
  const setWorkflows = useDashboardStore((s) => s.setWorkflows)
  const queryClient = useQueryClient()

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

      <div className="grid gap-3">
        {workflows.map((workflow, index) => {
          const active = workflow.id === selectedWorkflowId
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
                <div>
                  <h2 className="font-display text-lg font-semibold">{workflow.name}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {workflow.description}
                  </p>
                </div>
                <div className="flex gap-2">
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

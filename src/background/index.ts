import { onRuntimeMessage } from '@/shared/messaging/bus'
import { openFloatingDashboard } from '@/background/dashboard-window'
import { workflowRunner } from '@/engine/workflow/workflow-runner'
import { jobQueue } from '@/engine/queue/job-queue'
import { activityLog } from '@/engine/activity/activity-log'
import { storageGet, storageSet } from '@/shared/storage/chrome-storage'
import { sampleWorkflows } from '@/data/sample-workflows'
import { samplePlans, sampleVisualWorkflows } from '@/planner/data/sample-plans'
import { plannerRunner } from '@/planner/engine/planner-runner'
import { executePlannerAction } from '@/planner/engine/action-executor'
import { copyStore, isWorkflowCopyStore } from '@/engine/copy-store'
import {
  clearDurableWorkflowStore,
  deleteDurableEntry,
  loadDurableWorkflowStore,
} from '@/engine/copy-store/durable'
import { tabController } from '@/engine/automation/tab-controller'
import { ensureContentScript } from '@/background/ensure-content-script'
import { KEEPALIVE_ALARM, runGuardController } from '@/background/run-guard-controller'
import { trustedClickAt } from '@/background/trusted-click'
import { sendTabMessage } from '@/shared/messaging/bus'
import type { WorkflowDefinition } from '@/shared/types/workflow'
import type { VisualWorkflow } from '@/planner/types/plan'
import type { WorkflowStartPayload } from '@/shared/types/messages'

interface PickedElement {
  selector: string
  tagName: string
  text: string
  attributes: Record<string, string>
}

type PickResult = { ok: boolean; picked?: PickedElement; error?: string }

let pickWaiter: {
  resolve: (value: PickResult) => void
  timer: ReturnType<typeof setTimeout>
} | null = null

function beginPickWait(timeoutMs = 120_000): Promise<PickResult> {
  if (pickWaiter) {
    pickWaiter.resolve({ ok: false, error: 'Previous pick cancelled' })
    clearTimeout(pickWaiter.timer)
    pickWaiter = null
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!pickWaiter) return
      pickWaiter = null
      resolve({ ok: false, error: 'Timed out waiting for element pick. Try again.' })
    }, timeoutMs)

    pickWaiter = {
      timer,
      resolve: (value) => {
        clearTimeout(timer)
        pickWaiter = null
        resolve(value)
      },
    }
  })
}

function settlePickWait(value: PickResult): void {
  if (!pickWaiter) return
  const { resolve } = pickWaiter
  clearTimeout(pickWaiter.timer)
  pickWaiter = null
  resolve(value)
}

const WORKFLOWS_KEY = 'workflows'

async function ensureWorkflows(): Promise<WorkflowDefinition[]> {
  const existing = await storageGet<WorkflowDefinition[]>(WORKFLOWS_KEY, [])
  if (existing.length === 0) {
    await storageSet(WORKFLOWS_KEY, sampleWorkflows)
    return sampleWorkflows
  }

  const byId = new Map(existing.map((item) => [item.id, item]))
  let changed = false
  for (const sample of sampleWorkflows) {
    if (!byId.has(sample.id)) {
      byId.set(sample.id, sample)
      changed = true
    }
  }

  const merged = Array.from(byId.values())
  if (changed) await storageSet(WORKFLOWS_KEY, merged)
  return merged
}

async function ensurePlannerWorkspace(): Promise<void> {
  const existing = await storageGet<{
    plans: unknown[]
    workflows: VisualWorkflow[]
    favorites: string[]
    theme: 'light' | 'dark'
  }>('planner-workspace', {
    plans: [],
    workflows: [],
    favorites: [],
    theme: 'light',
  })

  if ((existing.plans?.length ?? 0) === 0) {
    await storageSet('planner-workspace', {
      plans: samplePlans,
      workflows: sampleVisualWorkflows,
      favorites: ['ai.open_chatgpt', 'ai.click_send', 'mouse.click'],
      theme: 'light',
      updatedAt: new Date().toISOString(),
    })
    plannerRunner.registerWorkflows(sampleVisualWorkflows)
    return
  }

  plannerRunner.registerWorkflows(existing.workflows ?? [])
}

async function bootstrap(): Promise<void> {
  await activityLog.hydrate()
  await workflowRunner.hydrate()
  await plannerRunner.hydrate()
  await jobQueue.hydrate()
  await ensureWorkflows()
  await ensurePlannerWorkspace()

  jobQueue.setProcessor(async (job) => {
    const workflows = await ensureWorkflows()
    const workflow = workflows.find((item) => item.id === job.workflowId)
    if (!workflow) throw new Error(`Workflow not found: ${job.workflowId}`)
    await workflowRunner.start(workflow)
  })

  // If a run was mid-flight when the worker slept, keep the guard + loop alive
  const checkpoint = plannerRunner.getCheckpoint()
  if (checkpoint?.status === 'running') {
    runGuardController.start()
    void runGuardController
      .beginTrustedDebug(checkpoint.browserState.activeTabId)
      .then((tabId) => {
        if (tabId != null) checkpoint.browserState.activeTabId = tabId
      })
    void plannerRunner.resumeFromCheckpoint()
  }

  await activityLog.append('info', 'Background', 'Automation Engine service worker ready')
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return
  const checkpoint = plannerRunner.getCheckpoint()
  if (checkpoint?.status !== 'running') return
  void runGuardController.refreshLockedTab()
  void plannerRunner.resumeFromCheckpoint()
})

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap()
})

chrome.runtime.onStartup.addListener(() => {
  void bootstrap()
})

chrome.action.onClicked.addListener(() => {
  void openFloatingDashboard()
})

onRuntimeMessage(async (message, sender) => {
  switch (message.type) {
    case 'OPEN_DASHBOARD':
      await openFloatingDashboard()
      return { ok: true }

    case 'PING':
      return { ok: true, pong: true }

    case 'TRUSTED_CLICK': {
      const payload = (message.payload ?? {}) as { x?: number; y?: number; tabId?: number }
      const tabId = payload.tabId ?? sender.tab?.id
      if (tabId == null) return { ok: false, error: 'No tab for trusted click' }
      const x = Number(payload.x)
      const y = Number(payload.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, error: 'Invalid click coordinates' }
      }
      return trustedClickAt(tabId, x, y)
    }

    case 'WORKFLOW_START': {
      const payload = message.payload as WorkflowStartPayload
      const run = await workflowRunner.start(payload.workflow, payload.variables)
      return { ok: true, run }
    }

    case 'WORKFLOW_PAUSE':
      workflowRunner.pause()
      return { ok: true, run: workflowRunner.getState() }

    case 'WORKFLOW_RESUME':
      workflowRunner.resume()
      return { ok: true, run: workflowRunner.getState() }

    case 'WORKFLOW_CANCEL':
      workflowRunner.cancel()
      return { ok: true, run: workflowRunner.getState() }

    case 'WORKFLOW_STATE':
      return { ok: true, run: workflowRunner.getState() }

    case 'QUEUE_ENQUEUE': {
      const { workflowId, priority } = message.payload as {
        workflowId: string
        priority?: number
      }
      const job = await jobQueue.enqueue(workflowId, priority)
      return { ok: true, job }
    }

    case 'QUEUE_STATE':
      return { ok: true, queue: await jobQueue.list() }

    case 'ACTIVITY_LIST':
      return { ok: true, logs: await activityLog.list(200) }

    case 'ACTIVITY_CLEAR':
      await activityLog.clear()
      await plannerRunner.clearCheckpoint()
      return { ok: true, checkpoint: null }

    case 'EXTENSION_RELOAD':
      // Respond first so the UI can finish the message channel, then reload.
      setTimeout(() => chrome.runtime.reload(), 120)
      return { ok: true }

    case 'TEST_SELECTOR': {
      const payload = (message.payload ?? {}) as {
        selector?: string
        fallbacks?: string[]
        text?: string
        value?: string
        kind?: string
        exact?: boolean
        matchMode?: string
        urlHint?: string
        actionId?: string
        fireEvent?: boolean
      }

      let tabId: number | undefined
      if (payload.urlHint) {
        const found = await tabController.findTabByUrl(payload.urlHint)
        tabId = found?.id
      }
      if (!tabId) {
        const active = await tabController.getActiveTab()
        tabId = active?.id
      }
      if (!tabId) {
        return { ok: false, error: 'No browser tab open — open the target page first' }
      }

      try {
        await ensureContentScript(tabId)
        const result = await sendTabMessage<{
          ok: boolean
          data?: Record<string, unknown>
          error?: string
        }>(tabId, {
          type: 'AUTOMATION_COMMAND',
          payload: {
            action: 'testSelector',
            selector: payload.selector,
            fallbacks: payload.fallbacks ?? [],
            text: payload.text,
            value: payload.value,
            options: {
              kind: payload.kind ?? 'selector',
              exact: Boolean(payload.exact),
              matchMode: payload.matchMode ?? 'contains',
              actionId: payload.actionId ?? '',
              fireEvent: payload.fireEvent !== false,
            },
            // Click/type events need a bit more time than find-only
            timeoutMs: 8_000,
          },
        })
        if (!result?.ok) {
          return { ok: false, error: result?.error ?? 'Test failed on page' }
        }
        return { ok: true, result: result.data, tabId }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    case 'STORAGE_GET': {
      const { key, fallback } = message.payload as { key: string; fallback: unknown }
      return { ok: true, value: await storageGet(key, fallback) }
    }

    case 'STORAGE_SET': {
      const { key, value } = message.payload as { key: string; value: unknown }
      await storageSet(key, value)
      if (key === 'planner-workspace') {
        const workspace = value as { workflows?: VisualWorkflow[] }
        if (workspace?.workflows) plannerRunner.registerWorkflows(workspace.workflows)
      }
      return { ok: true }
    }

    case 'OPEN_URL': {
      const { url } = message.payload as { url: string }
      const existing = await tabController.findTabByUrl(url)
      if (existing?.id) {
        await tabController.switchToTab(existing.id)
        await tabController.waitForComplete(existing.id)
        return { ok: true, tabId: existing.id }
      }
      const tab = await tabController.openUrl(url, true)
      return { ok: true, tabId: tab.id }
    }

    case 'PICK_ELEMENT_START': {
      const payload = (message.payload ?? {}) as { tabId?: number; urlHint?: string }
      let tabId = payload.tabId

      if (!tabId && payload.urlHint) {
        const found = await tabController.findTabByUrl(payload.urlHint)
        tabId = found?.id
        if (!tabId) {
          const opened = await tabController.openUrl(payload.urlHint, true)
          tabId = opened.id
        }
      }

      if (!tabId) {
        const active = await tabController.getActiveTab()
        tabId = active?.id
      }

      if (!tabId) {
        return { ok: false, error: 'No tab available for element picking' }
      }

      await tabController.switchToTab(tabId)
      await tabController.waitForComplete(tabId).catch(() => undefined)

      try {
        await ensureContentScript(tabId)
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }

      const resultPromise = beginPickWait()

      try {
        const started = await sendTabMessage<{ ok?: boolean; started?: boolean; error?: string }>(
          tabId,
          { type: 'PICK_ELEMENT_START' },
        )
        if (!started?.ok) {
          settlePickWait({
            ok: false,
            error: started?.error ?? 'Failed to start element picker on the page',
          })
          return await resultPromise
        }
      } catch (error) {
        try {
          await ensureContentScript(tabId)
          const started = await sendTabMessage<{ ok?: boolean; error?: string }>(tabId, {
            type: 'PICK_ELEMENT_START',
          })
          if (!started?.ok) {
            settlePickWait({
              ok: false,
              error: started?.error ?? 'Failed to start element picker on the page',
            })
            return await resultPromise
          }
        } catch (retryError) {
          settlePickWait({
            ok: false,
            error:
              retryError instanceof Error
                ? retryError.message
                : error instanceof Error
                  ? error.message
                  : 'Could not reach the page content script',
          })
          return await resultPromise
        }
      }

      return await resultPromise
    }

    case 'PICK_ELEMENT_RESULT': {
      const payload = (message.payload ?? {}) as PickResult
      settlePickWait({
        ok: Boolean(payload.ok),
        picked: payload.picked,
        error: payload.error,
      })
      return { ok: true }
    }

    case 'PLANNER_START': {
      const { workflow } = message.payload as { workflow: VisualWorkflow }
      const workspace = await storageGet<{ workflows: VisualWorkflow[] }>('planner-workspace', {
        workflows: [],
      })
      plannerRunner.registerWorkflows(workspace.workflows ?? [workflow])
      await plannerRunner.start(workflow)
      return { ok: true, checkpoint: plannerRunner.getCheckpoint() }
    }

    case 'PLANNER_PAUSE':
      plannerRunner.pause()
      return { ok: true, checkpoint: plannerRunner.getCheckpoint() }

    case 'PLANNER_RESUME':
      await plannerRunner.resumeFromCheckpoint()
      return { ok: true, checkpoint: plannerRunner.getCheckpoint() }

    case 'PLANNER_CANCEL':
      plannerRunner.cancel()
      return { ok: true, checkpoint: plannerRunner.getCheckpoint() }

    case 'PLANNER_STATE':
      return { ok: true, checkpoint: plannerRunner.getCheckpoint() }

    case 'PLANNER_COPY_STORE_DELETE': {
      const payload = (message.payload ?? {}) as { workflowId?: string; name?: string }
      if (!payload.workflowId || !payload.name) {
        return { ok: false, error: 'workflowId and name are required' }
      }
      try {
        const next = await deleteDurableEntry(payload.workflowId, payload.name)
        copyStore.setRuntimeStore(payload.workflowId, next)
        await plannerRunner.syncCopyStoreSnapshot(payload.workflowId, next)
        return {
          ok: true,
          store: next,
          checkpoint: plannerRunner.getCheckpoint(),
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    case 'PLANNER_COPY_STORE_CLEAR': {
      const payload = (message.payload ?? {}) as { workflowId?: string }
      if (!payload.workflowId) {
        return { ok: false, error: 'workflowId is required' }
      }
      try {
        await clearDurableWorkflowStore(payload.workflowId)
        copyStore.resetRuntime(payload.workflowId)
        await plannerRunner.syncCopyStoreSnapshot(payload.workflowId, {})
        return {
          ok: true,
          store: {},
          checkpoint: plannerRunner.getCheckpoint(),
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    case 'PLANNER_TEST_ACTION': {
      const payload = (message.payload ?? {}) as {
        workflowId: string
        planId?: string
        actionId: string
        params?: Record<string, unknown>
        selector?: string
        fallbacks?: string[]
        timeoutMs?: number
      }

      if (!payload.workflowId || !payload.actionId) {
        return { ok: false, error: 'workflowId and actionId are required' }
      }

      if (plannerRunner.isBusy()) {
        return {
          ok: false,
          error: 'Planner is running — Pause/Cancel first, then Quick test this step',
        }
      }

      try {
        const durable = await loadDurableWorkflowStore(payload.workflowId)
        const checkpoint = plannerRunner.getCheckpoint()
        const baseVars =
          checkpoint?.workflowId === payload.workflowId ? { ...checkpoint.variables } : {}
        const liveStore = isWorkflowCopyStore(baseVars.copyStore) ? baseVars.copyStore : {}
        const mergedStore = { ...durable, ...liveStore }

        const prevStores =
          baseVars.copyStores && typeof baseVars.copyStores === 'object'
            ? (baseVars.copyStores as Record<string, unknown>)
            : {}

        const variables: Record<string, unknown> = {
          ...baseVars,
          copyStore: mergedStore,
          copyStores: {
            ...prevStores,
            [payload.workflowId]: mergedStore,
          },
          __workflowId: payload.workflowId,
        }

        copyStore.hydrateRuntime({
          copyStore: mergedStore,
          copyStores: { [payload.workflowId]: mergedStore },
        })

        const params: Record<string, unknown> = {
          ...(payload.params ?? {}),
        }
        if (payload.selector) params.selector = payload.selector
        if (payload.fallbacks?.length) params.selectorFallbacks = payload.fallbacks

        const result = await executePlannerAction({
          actionId: payload.actionId,
          params,
          variables,
          activeTabId: checkpoint?.browserState.activeTabId,
          timeoutMs: payload.timeoutMs ?? 30_000,
          workflowId: payload.workflowId,
          planId: payload.planId,
        })

        if (result.variables) {
          await plannerRunner.mergeVariablesFromTest(payload.workflowId, result.variables)
        }

        const output =
          result.output && typeof result.output === 'object'
            ? (result.output as Record<string, unknown>)
            : { value: result.output }

        return {
          // waiting (e.g. Pause) still means the step ran as designed in Quick Test
          ok: result.status === 'success' || result.status === 'waiting',
          error: result.error,
          result: {
            status: result.status,
            branch: result.branch,
            nextNodeId: result.nextNodeId,
            activeTabId: result.activeTabId,
            storedAs: output.storedAs,
            textPreview:
              typeof output.text === 'string'
                ? String(output.text).slice(0, 160)
                : typeof output.matchedText === 'string'
                  ? String(output.matchedText).slice(0, 160)
                  : undefined,
            textLength: typeof output.text === 'string' ? output.text.length : undefined,
            format: output.format,
            sourceMode: output.sourceMode,
            clipboardOk: output.clipboardOk,
            clipboardError: output.clipboardError,
            output,
          },
          checkpoint: plannerRunner.getCheckpoint(),
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    default:
      return { ok: false, error: `Unhandled message: ${message.type}` }
  }
})

void bootstrap()

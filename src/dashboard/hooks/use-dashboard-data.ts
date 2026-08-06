import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchLogs,
  fetchQueue,
  fetchRunState,
  fetchWorkflows,
} from '@/dashboard/api/extension-api'
import { useDashboardStore } from '@/stores/dashboard-store'

export function useDashboardData() {
  const setWorkflows = useDashboardStore((s) => s.setWorkflows)
  const setRun = useDashboardStore((s) => s.setRun)
  const setQueue = useDashboardStore((s) => s.setQueue)
  const setLogs = useDashboardStore((s) => s.setLogs)
  const selectWorkflow = useDashboardStore((s) => s.selectWorkflow)
  const selectedWorkflowId = useDashboardStore((s) => s.selectedWorkflowId)

  const workflowsQuery = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
    refetchInterval: 5000,
  })

  const runQuery = useQuery({
    queryKey: ['run'],
    queryFn: fetchRunState,
    refetchInterval: 1000,
  })

  const queueQuery = useQuery({
    queryKey: ['queue'],
    queryFn: fetchQueue,
    refetchInterval: 2000,
  })

  const logsQuery = useQuery({
    queryKey: ['logs'],
    queryFn: fetchLogs,
    refetchInterval: 2000,
  })

  useEffect(() => {
    if (workflowsQuery.data) {
      setWorkflows(workflowsQuery.data)
      if (!selectedWorkflowId && workflowsQuery.data[0]) {
        selectWorkflow(workflowsQuery.data[0].id)
      }
    }
  }, [workflowsQuery.data, selectedWorkflowId, selectWorkflow, setWorkflows])

  useEffect(() => {
    if (runQuery.data !== undefined) setRun(runQuery.data)
  }, [runQuery.data, setRun])

  useEffect(() => {
    if (queueQuery.data) setQueue(queueQuery.data)
  }, [queueQuery.data, setQueue])

  useEffect(() => {
    if (logsQuery.data) setLogs(logsQuery.data)
  }, [logsQuery.data, setLogs])

  return {
    isLoading:
      workflowsQuery.isLoading ||
      runQuery.isLoading ||
      queueQuery.isLoading ||
      logsQuery.isLoading,
  }
}

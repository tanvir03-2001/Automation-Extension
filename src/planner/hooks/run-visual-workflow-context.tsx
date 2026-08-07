import { createContext, useContext, type ReactNode } from 'react'

/** When set, node/edge run visuals bind to this VisualWorkflow id (Overview live preview). */
const RunVisualWorkflowIdContext = createContext<string | null>(null)

export function RunVisualWorkflowProvider({
  workflowId,
  children,
}: {
  workflowId: string | null
  children: ReactNode
}) {
  return (
    <RunVisualWorkflowIdContext.Provider value={workflowId}>
      {children}
    </RunVisualWorkflowIdContext.Provider>
  )
}

export function useRunVisualWorkflowIdOverride(): string | null {
  return useContext(RunVisualWorkflowIdContext)
}

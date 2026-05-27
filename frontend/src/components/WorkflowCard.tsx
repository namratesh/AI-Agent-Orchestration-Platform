import { GitBranch, Play, ChevronRight } from 'lucide-react'
import type { Workflow } from '../types'

interface Props {
  workflow: Workflow
  onExecute?: () => void
  onClick?: () => void
  selected?: boolean
}

export default function WorkflowCard({ workflow, onExecute, onClick, selected }: Props) {
  const nodeCount = workflow.definition.nodes.length
  const edgeCount = workflow.definition.edges.length

  return (
    <div
      onClick={onClick}
      className={`card p-4 transition-all duration-200 hover:shadow-card-hover group ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''} ${selected ? 'ring-2 ring-primary-500' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shrink-0">
          <GitBranch size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{workflow.name}</h3>
            {onExecute ? (
              <button
                onClick={(e) => { e.stopPropagation(); onExecute() }}
                className="opacity-0 group-hover:opacity-100 btn-primary py-1 px-2 text-xs gap-1"
              >
                <Play size={11} />Run
              </button>
            ) : (
              <ChevronRight size={16} className="text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5 truncate">{workflow.id.slice(0, 8)}…</p>
          <div className="mt-2 flex gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{nodeCount} node{nodeCount !== 1 ? 's' : ''}</span>
            <span>{edgeCount} edge{edgeCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

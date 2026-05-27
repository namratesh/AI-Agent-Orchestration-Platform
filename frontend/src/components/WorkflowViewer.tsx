import ReactFlow, { Background, Controls, Edge, Node } from 'reactflow'
import 'reactflow/dist/style.css'
import { Agent, WorkflowDefinition } from '../api'

interface Props {
  definition: WorkflowDefinition
  agents: Agent[]
}

export default function WorkflowViewer({ definition, agents }: Props) {
  const agentMap = new Map(agents.map(a => [a.id, a]))

  const nodes: Node[] = definition.nodes.map((n, i) => ({
    id: n.id,
    position: { x: i * 220 + 20, y: 80 },
    data: {
      label: (
        <div className="text-center">
          <div className="font-semibold text-xs">
            {n.agent_id && agentMap.has(n.agent_id)
              ? agentMap.get(n.agent_id)!.name
              : n.id}
          </div>
          <div className="text-gray-400 text-xs mt-0.5">{n.type}</div>
        </div>
      ),
    },
    style: {
      background: n.id === definition.start_node_id ? '#eef2ff' : '#fff',
      border: n.id === definition.start_node_id ? '1px solid #6366f1' : '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      width: 160,
    },
  }))

  const edges: Edge[] = definition.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source_node_id,
    target: e.target_node_id,
    animated: true,
    style: { stroke: '#6366f1' },
    label: e.condition,
  }))

  return (
    <div style={{ height: 240 }} className="border border-gray-200 rounded-lg overflow-hidden">
      <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false}>
        <Background color="#f3f4f6" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

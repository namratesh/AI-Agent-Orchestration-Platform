import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgentCard from '../components/AgentCard'
import type { Agent } from '../types'

const _agent: Agent = {
  id: 'test-id-1',
  name: 'Research Agent',
  role: 'researcher',
  system_prompt: 'You research topics.',
  model: 'gpt-4-turbo',
  provider: 'openai',
  tools: ['web_search'],
  config: {},
}

describe('AgentCard', () => {
  it('renders the agent name', () => {
    render(<AgentCard agent={_agent} onDelete={vi.fn()} />)
    expect(screen.getByText('Research Agent')).toBeInTheDocument()
  })

  it('renders the agent role', () => {
    render(<AgentCard agent={_agent} onDelete={vi.fn()} />)
    expect(screen.getByText('researcher')).toBeInTheDocument()
  })

  it('renders the provider badge', () => {
    render(<AgentCard agent={_agent} onDelete={vi.fn()} />)
    expect(screen.getByText('openai')).toBeInTheDocument()
  })

  it('renders tool badges', () => {
    render(<AgentCard agent={_agent} onDelete={vi.fn()} />)
    expect(screen.getByText('web_search')).toBeInTheDocument()
  })

  it('calls onDelete when delete button clicked', () => {
    const onDelete = vi.fn()
    const { container } = render(<AgentCard agent={_agent} onDelete={onDelete} />)
    const deleteBtn = container.querySelector('button[title="Delete agent"]')!
    fireEvent.click(deleteBtn)
    expect(onDelete).toHaveBeenCalledWith('test-id-1')
  })

  it('applies selected ring when selected prop is true', () => {
    const { container } = render(
      <AgentCard agent={_agent} onDelete={vi.fn()} selected={true} />
    )
    expect(container.firstChild).toHaveClass('ring-2')
  })
})

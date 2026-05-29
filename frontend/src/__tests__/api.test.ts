/**
 * Tests for the API client module.
 * Mocks axios so no real HTTP requests are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock axios before importing the api module
vi.mock('axios', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  }
  return {
    default: {
      create: vi.fn(() => mockApi),
    },
    __mockApi: mockApi,
  }
})

import axios from 'axios'
import { listAgents, createAgent, listWorkflows, createWorkflow, getExecution } from '../api'

const _mockApi = (axios as unknown as { __mockApi: ReturnType<typeof axios.create> }).__mockApi

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listAgents', () => {
  it('calls GET /agents and returns data', async () => {
    const agents = [{ id: '1', name: 'Agent A' }]
    ;(_mockApi.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: agents })
    const result = await listAgents()
    expect(_mockApi.get).toHaveBeenCalledWith('/agents')
    expect(result).toEqual(agents)
  })
})

describe('createAgent', () => {
  it('calls POST /agents with the payload', async () => {
    const payload = {
      name: 'New Agent', role: 'assistant', system_prompt: 'You help.',
      model: 'gpt-4-turbo', provider: 'openai', tools: [], config: {},
    }
    const created = { id: 'abc', ...payload }
    ;(_mockApi.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: created })
    const result = await createAgent(payload)
    expect(_mockApi.post).toHaveBeenCalledWith('/agents', payload)
    expect(result).toEqual(created)
  })
})

describe('listWorkflows', () => {
  it('calls GET /workflows and returns data', async () => {
    const workflows = [{ id: 'w1', name: 'My WF' }]
    ;(_mockApi.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: workflows })
    const result = await listWorkflows()
    expect(_mockApi.get).toHaveBeenCalledWith('/workflows')
    expect(result).toEqual(workflows)
  })
})

describe('getExecution', () => {
  it('calls GET /executions/:id', async () => {
    const exec = { id: 'e1', status: 'success', result: 'done' }
    ;(_mockApi.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: exec })
    const result = await getExecution('e1')
    expect(_mockApi.get).toHaveBeenCalledWith('/executions/e1')
    expect(result).toEqual(exec)
  })
})

describe('createWorkflow', () => {
  it('calls POST /workflows with definition', async () => {
    const payload = {
      name: 'WF', definition: { nodes: [], edges: [], start_node_id: '' },
    }
    const created = { id: 'w2', ...payload }
    ;(_mockApi.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: created })
    const result = await createWorkflow(payload)
    expect(_mockApi.post).toHaveBeenCalledWith('/workflows', payload)
    expect(result).toEqual(created)
  })
})

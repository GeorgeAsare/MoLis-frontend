export interface Agent {
  id: string
  name: string
  type: string
  status: 'active' | 'idle' | 'error'
  description?: string
  last_active?: string
}

export interface AgentMessage {
  id: string
  agent_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

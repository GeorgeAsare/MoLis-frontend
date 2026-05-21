import { api } from './client'
import type { Agent, AgentMessage } from '@/types/agent'

export async function getAgents(): Promise<Agent[]> {
  return api.get<Agent[]>('/agents')
}

export async function getAgent(id: string): Promise<Agent> {
  return api.get<Agent>(`/agents/${id}`)
}

export async function sendAgentMessage(
  agentId: string,
  content: string
): Promise<AgentMessage> {
  return api.post<AgentMessage>(`/agents/${agentId}/messages`, { content })
}

export async function getAgentMessages(agentId: string): Promise<AgentMessage[]> {
  return api.get<AgentMessage[]>(`/agents/${agentId}/messages`)
}

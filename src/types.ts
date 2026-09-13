export interface Citation {
  doc_id: string;
  docidentifier: string;
  edition?: string;
  language?: string;
  clause_anchor?: string;
  clause_title?: string;
  snippet?: string;
  score?: number;
  status?: string;
  superseded_by?: string;
  corpus?: string;
  url?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  model?: string;
  queryHash?: string;
  followUps?: string[];
  /** answer contract v2: server-validated typed MKO blocks ([[u:]] refs) */
  blocks?: { unit_id: string; type: string; docidentifier: string; edition?: string; payload: Record<string, unknown> }[];
  at: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  origin: "local" | "cloud";
  cloudId?: string;
  messages: Message[];
}

export interface Account {
  authenticated: boolean;
  name: string | null;
  email: string | null;
  /** OIDC picture claim (avatar URL) — null when the OP issues none */
  picture: string | null;
  roles: string[];
  tier: "member" | "anon";
}

export interface Dataset {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  authenticated?: boolean;
  requires?: string;
}

export interface Quota {
  used: number;
  limit: number;
}

export interface MemoryFile {
  id: string;
  name: string;
  content: string;
  enabled: number;
  updated_at: number;
}

export interface Project {
  id: string;
  name: string;
  created_at: number;
  file_count: number;
  conversation_count: number;
}

export interface ProjectFile {
  id: string;
  name: string;
  content: string;
  updated_at: number;
}

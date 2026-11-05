export type ScAgentProfile = {
  id?: string;
  test_id?: string;
  age: number;
  gender: 'Homme' | 'Femme';
  tech_level: number; // 1-10
  device_type: 'mobile' | 'desktop';
  traits: string;
  multiplier: number; // Pour le scaling de la foule
};

export type ScTest = {
  id: string;
  url: string;
  goal: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failure' | 'cancelled';
  created_at: string;
  total_runs: number;
  finished_runs: number;
  summary_status: 'pending' | 'running' | 'completed' | 'failure' | 'skipped';
  summary: { summary: string; recurring_problems: string[]; priorities: string[]; limitations: string[] } | null;
};

export type ActionLog = {
  step: number;
  action: string;
  reasoning: string;
  selector?: string;
  value?: string;
  timestamp: string;
};

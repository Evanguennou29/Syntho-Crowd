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
  status: 'running' | 'completed' | 'failure';
  created_at: string;
};

export type ActionLog = {
  step: number;
  action: string;
  reasoning: string;
  selector?: string;
  value?: string;
  timestamp: string;
};
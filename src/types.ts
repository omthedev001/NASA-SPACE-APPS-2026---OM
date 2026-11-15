export type MissionEnvironment = 'spacecraft' | 'station' | 'rover' | 'base';

export type BodyPartId = 'brain' | 'lungs' | 'heart' | 'metabolic' | 'muscles';

export type AppPageId =
  | 'overview'
  | 'exam'
  | 'logs'
  | 'telemetry'
  | 'algorithms'
  | 'wellness'
  | 'deploy';

export interface ActionableProtocol {
  id: string;
  category: 'physical' | 'radiation' | 'mental' | 'metabolic';
  hazard: string;
  hrp_factor: string;
  severity: 'WARNING' | 'CRITICAL';
  guidance: string;
  checklist: string[];
}

export interface MentalCheckin {
  mood_score: number;
  sleep_hours: number;
  cognitive_fatigue: boolean;
  isolation_stress: boolean;
}

export interface SelfAssessment {
  systolic_bp: number;
  diastolic_bp: number;
  blood_sugar_mg_dl: number;
  body_temp_c: number;
  map_mmhg?: number;
}

export interface News2BreakdownItem {
  parameter: string;
  value: string;
  points: number;
  max_points: number;
}

export interface News2Summary {
  total_score: number;
  acuity_tier: 'NOMINAL' | 'MONITOR' | 'URGENT' | 'EMERGENCY';
  breakdown: News2BreakdownItem[];
}

export interface EnvironmentProfile {
  label: string;
  gravity_g: number;
  shielding_factor: number;
  comm_delay: string;
}

export interface HistoryPoint {
  tick: number;
  timestamp: number;
  raw_spo2: number;
  ema_spo2: number;
  raw_hr: number;
  ema_hr: number;
  proton_flux: number;
  radiation_slope: number;
  ambient_dose: number;
  mental_stress_index: number;
  blood_sugar_mg_dl: number;
  body_temp_c: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  map_mmhg?: number;
}

export interface LiveLabs {
  lactate: number | null;
  cortisol: number | null;
  crp: number | null;
  hemoglobin: number | null;
  wbc: number | null;
  po2: number | null;
  pco2: number | null;
  ph: number | null;
  sodium: number | null;
  potassium: number | null;
}

export interface TelemetrySnapshot {
  timestamp: number;
  smoothed_spo2: number;
  raw_spo2: number;
  smoothed_heart_rate: number;
  raw_heart_rate: number;
  radiation_flux: number;
  ambient_dose: number;
  cumulative_dose_msv: number;
  radiation_slope: number;
  genetic_atrophy_baseline: number;
  muscle_atrophy_risk: number;
  mental_stress_index: number;
  mental_checkin: MentalCheckin;
  self_assessment: SelfAssessment;
  live_labs?: LiveLabs;
  news2?: News2Summary;
  daily_logs_summary?: DailyLogsSummary;
  environment: MissionEnvironment;
  environment_profile: EnvironmentProfile;
  completed_routines: string[];
  protocols: ActionableProtocol[];
  history: HistoryPoint[];
  backend_engine?: {
    runtime: string;
    port: number;
    uptime_s: number;
  };
  simulator: {
    playing: boolean;
    current_row: number;
    total_rows: number;
  };
}

export interface AlgorithmExplanation {
  python_runtime: string;
  ema: {
    alpha: number;
    formula: string;
    spo2_raw: number;
    spo2_prev_ema: number;
    spo2_ema: number;
    hr_raw: number;
    hr_prev_ema: number;
    hr_ema: number;
    hypoxia_threshold: number;
  };
  ols_radiation_slope: {
    formula: string;
    window_size: number;
    window_points: Array<{ timestamp: number; proton_flux: number }>;
    mean_dt: number;
    mean_flux: number;
    numerator: number;
    denominator: number;
    slope_pfu_s: number;
    spe_threshold: number;
    shielding_factor: number;
    days_to_30d_bfo_limit: number;
  };
  genomic_atrophy: {
    formula: string;
    baseline: number;
    gravity_penalty: number;
    hypoxia_penalty: number;
    stress_penalty: number;
    computed_risk: number;
  };
  mental_stress: {
    score: number;
    autonomic_load: number;
    radiation_anxiety: number;
    sleep_deficit: number;
    mood_strain: number;
    flag_penalty: number;
  };
  news2: News2Summary;
}

export interface ExamRecord {
  id: number;
  created_utc: string;
  met_seconds: number;
  exam_type: string;
  environment: string;
  systolic_bp: number;
  diastolic_bp: number;
  blood_sugar_mg_dl: number;
  body_temp_c: number;
  spo2_pct: number;
  heart_rate_bpm: number;
  news2_score: number;
  acuity_tier: string;
  notes: string;
  body_region: string;
  image_name: string;
  image_analysis: string;
}

export interface AlertEvent {
  id: number;
  created_utc: string;
  met_seconds: number;
  protocol_id: string;
  severity: string;
  hazard: string;
  status: string;
}

export interface BackendStatus {
  status: string;
  engine: string;
  python_version: string;
  port: number;
  uptime_seconds: number;
  sqlite: {
    db_path: string;
    db_bytes: number;
    exam_records_count: number;
    alert_events_count: number;
    crew_logs_count?: number;
  };
  feed_rows: number;
  algorithms: string[];
}

export interface DailyLogsSummary {
  diet_logs_count: number;
  total_calories_kcal: number;
  total_protein_g: number;
  total_water_ml: number;
  total_vitamin_d_iu: number;
  exercise_logs_count: number;
  total_exercise_min: number;
  total_calories_burned: number;
  mental_logs_count: number;
}

export interface DietLogEntry {
  id: number;
  created_utc: string;
  met_seconds: number;
  meal_type: string;
  description: string;
  calories_kcal: number;
  protein_g: number;
  water_ml: number;
  vitamin_d_iu: number;
}

export interface ExerciseLogEntry {
  id: number;
  created_utc: string;
  met_seconds: number;
  modality: string;
  duration_min: number;
  intensity: string;
  resistance_load_pct: number;
  calories_burned: number;
  notes: string;
}

export interface MentalLogEntry {
  id: number;
  created_utc: string;
  met_seconds: number;
  mood_score: number;
  stress_level: number;
  sleep_hours: number;
  triggers: string;
  journal_entry: string;
}

export interface DatasetFileInfo {
  name: string;
  bytes: number;
}

export interface DatasetInventory {
  radiation_files: DatasetFileInfo[];
  osd195_files: DatasetFileInfo[];
  mimic_files: DatasetFileInfo[];
  feed_exists: boolean;
  feed_rows: number;
  feed_bytes: number;
  genetic_atrophy_baseline: number;
}

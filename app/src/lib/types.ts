// Mirrors server/src/schema.ts

export interface Contact {
  email: string;
  phone: string;
  location: string;
  links: string[];
}

export interface Experience {
  title: string;
  company: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface Education {
  school: string;
  degree: string;
  field: string;
  start: string;
  end: string;
  details: string[];
}

export interface Project {
  name: string;
  description: string;
  bullets: string[];
}

export interface Resume {
  name: string;
  headline: string;
  contact: Contact;
  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  certifications: string[];
  projects: Project[];
}

export interface TailorResult {
  jobTitle: string;
  company: string;
  matchScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  changes: string[];
  resume: Resume;
  coverLetter: string;
}

export interface StoredProfile {
  resume: Resume;
  sourceFileName: string;
  updatedAt: number;
}

export interface HistoryItem {
  id: string;
  createdAt: number;
  jobUrl?: string;
  jobTitleInput?: string;
  jobDescription: string;
  result: TailorResult;
}

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  provider: "apple" | "google" | "dev";
}

export interface UsageBucket {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: number;
}

export interface Usage {
  plan: string;
  subscription: { active: boolean; expiresAt: number | null };
  tailor: UsageBucket;
  parse: UsageBucket;
}

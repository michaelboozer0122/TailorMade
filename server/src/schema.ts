import { z } from "zod";

// Every field is required (empty string / empty array when unknown) so the
// structured-output schema stays simple and the app never has to guess.

export const ContactSchema = z.object({
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(z.string()).describe("Portfolio, LinkedIn, GitHub, etc. as full URLs or handles"),
});

export const ExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  start: z.string().describe("As written on the resume, e.g. 'Jan 2021'"),
  end: z.string().describe("As written, or 'Present'"),
  bullets: z.array(z.string()),
});

export const EducationSchema = z.object({
  school: z.string(),
  degree: z.string(),
  field: z.string(),
  start: z.string(),
  end: z.string(),
  details: z.array(z.string()),
});

export const ProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  bullets: z.array(z.string()),
});

export const ResumeSchema = z.object({
  name: z.string(),
  headline: z.string().describe("Short professional title line under the name"),
  contact: ContactSchema,
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  certifications: z.array(z.string()),
  projects: z.array(ProjectSchema),
});
export type Resume = z.infer<typeof ResumeSchema>;

export const TailorResultSchema = z.object({
  jobTitle: z.string().describe("Title of the target job"),
  company: z.string().describe("Hiring company, or empty string if unknown"),
  matchScore: z
    .number()
    .describe("0-100 estimate of how well the candidate's real background fits the job"),
  matchedKeywords: z.array(z.string()).describe("Job keywords/skills the candidate genuinely has"),
  missingKeywords: z
    .array(z.string())
    .describe("Important job requirements the candidate's resume does not support"),
  changes: z.array(z.string()).describe("Plain-language list of what was changed and why"),
  resume: ResumeSchema,
  coverLetter: z.string().describe("A concise, tailored cover letter (3-4 short paragraphs)"),
});
export type TailorResult = z.infer<typeof TailorResultSchema>;

// Request bodies from the app.
export const TailorRequestSchema = z
  .object({
    profile: ResumeSchema,
    jobUrl: z.string().url().max(2048).optional(),
    jobText: z.string().max(100_000).optional(),
    jobTitle: z.string().max(200).optional(),
  })
  .refine((r) => r.jobUrl || r.jobText?.trim() || r.jobTitle?.trim(), {
    message: "Provide a job link, a job description, or a job title.",
  });
export type TailorRequest = z.infer<typeof TailorRequestSchema>;

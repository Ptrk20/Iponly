import { z } from "zod";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(10).max(128);

export const loginInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const registrationInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match.",
});
import { z } from "zod";

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  principalId: z.string().min(1),
  defaultChildId: z.string().min(1),
});

export type AuthSessionContract = z.infer<typeof authSessionSchema>;

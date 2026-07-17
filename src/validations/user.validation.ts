import { z } from '@/lib/zod';

const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const signupSchema = z
  .object({
    fullName: z
      .string({ error: 'Full name is required' })
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .openapi({ example: 'Jane Doe' }),
    email: z
      .string({ error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email format')
      .openapi({ example: 'jane@example.com' }),
    password: passwordSchema.openapi({ example: 'StrongPass1' }),
  })
  .openapi('SignupInput');

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z
  .object({
    email: z
      .string({ error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email format')
      .openapi({ example: 'jane@example.com' }),
    password: z.string({ error: 'Password is required' }).openapi({ example: 'StrongPass1' }),
  })
  .openapi('LoginInput');

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z
  .object({
    email: z
      .string({ error: 'Email is required' })
      .trim()
      .toLowerCase()
      .email('Invalid email format')
      .openapi({ example: 'jane@example.com' }),
  })
  .openapi('ForgotPasswordInput');

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z
      .string({ error: 'Reset token is required' })
      .openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
    newPassword: passwordSchema.openapi({ example: 'NewStrongPass1' }),
  })
  .openapi('ResetPasswordInput');

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

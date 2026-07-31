import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getCurrentUser,
  login,
  logout,
  register,
  resendCode,
  verifyEmail,
  type AuthDeps,
} from '@openscience/auth';
import { SESSION_COOKIE, UNAUTHORIZED_BODY, sessionTokenFrom } from './session-guard';

export interface AuthRouteDeps extends AuthDeps {
  secureCookies: boolean;
}

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600;

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Za-z]/, '密码需包含字母')
  .regex(/[0-9]/, '密码需包含数字');

const registerBody = z.object({
  invitationCode: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().min(1).max(64),
});
const verifyBody = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) });
const emailBody = z.object({ email: z.string().email() });
const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  app.post('/register', async (req, reply) => {
    const body = registerBody.parse(req.body);
    const result = await register(deps, body);
    return reply.status(201).send({ userId: result.userId, status: result.status });
  });

  app.post('/verify-email', async (req, reply) => {
    const body = verifyBody.parse(req.body);
    const result = await verifyEmail(deps, body);
    setSessionCookie(reply, result.sessionToken, deps.secureCookies);
    return reply.send({ userId: result.userId, status: result.status });
  });

  app.post('/resend-code', async (req, reply) => {
    const body = emailBody.parse(req.body);
    await resendCode(deps, body);
    return reply.status(202).send({ ok: true });
  });

  app.post('/login', async (req, reply) => {
    const body = loginBody.parse(req.body);
    const result = await login(deps, body);
    setSessionCookie(reply, result.sessionToken, deps.secureCookies);
    return reply.send({ userId: result.userId, status: result.status });
  });

  app.post('/logout', async (req, reply) => {
    const token = sessionTokenFrom(req);
    if (token) await logout(deps, token);
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/me', async (req, reply) => {
    const token = sessionTokenFrom(req);
    if (!token) return reply.status(401).send(UNAUTHORIZED_BODY);
    const me = await getCurrentUser(deps, token);
    return reply.send(me);
  });
}

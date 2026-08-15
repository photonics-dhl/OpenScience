import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { randomBytes } from 'node:crypto';
import process from 'node:process';

import { httpStatusForError } from '../../dist/error-map.js';
import { registerAuthRoutes } from '../../dist/routes/auth.js';

const users = [];
const challenges = [];
const sessions = new Map();
const latestCodes = new Map();
let sequence = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;

const prisma = {
  user: {
    findUnique: async ({ where }) => users.find((user) => where.email ? user.email === where.email : user.id === where.id) ?? null,
    create: async ({ data }) => {
      const user = { id: nextId(), level: 'free', createdAt: new Date(), updatedAt: new Date(), ...data };
      users.push(user);
      return user;
    },
    update: async ({ where, data }) => Object.assign(users.find((user) => user.id === where.id), data),
  },
  signupChallenge: {
    findFirst: async ({ where }) => challenges
      .filter((challenge) => challenge.email === where.email && challenge.consumedAt === null)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null,
    create: async ({ data }) => {
      if (challenges.some((challenge) => challenge.email === data.email && challenge.consumedAt === null)) {
        const error = new Error('active challenge exists');
        error.code = 'P2002';
        throw error;
      }
      const challenge = { id: nextId(), attempts: 0, lockedUntil: null, consumedAt: null, createdAt: new Date(), ...data };
      challenges.push(challenge);
      return challenge;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const challenge of challenges) {
        const matches = challenge.id === where.id
          && (where.consumedAt === undefined || challenge.consumedAt === where.consumedAt)
          && (where.attempts === undefined || challenge.attempts === where.attempts);
        if (matches) { Object.assign(challenge, data); count += 1; }
      }
      return { count };
    },
  },
  $transaction: async (operation) => operation(prisma),
};

const redis = {
  set: async (key, value) => { sessions.set(key, value); return 'OK'; },
  get: async (key) => sessions.get(key) ?? null,
  del: async (key) => sessions.delete(key) ? 1 : 0,
  expire: async () => 1,
};

const app = Fastify({ logger: false });
await app.register(cookie, { secret: randomBytes(32).toString('hex') });
app.setErrorHandler((error, request, reply) => {
  const { status, body } = httpStatusForError(error, String(request.id));
  void reply.status(status).send(body);
});

const deps = {
  prisma,
  redis,
  secureCookies: false,
  mailer: {
    send: async (message) => {
      const code = message.text.match(/(\d{6})/)?.[1];
      if (code) latestCodes.set(message.to, code);
    },
  },
  onEmailVerified: async () => {},
};
await app.register(async (instance) => registerAuthRoutes(instance, deps), { prefix: '/auth' });
app.get('/test/latest-code', async (request, reply) => {
  const email = String(request.query?.email ?? '');
  const code = latestCodes.get(email);
  return code ? reply.send({ code }) : reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No code' } });
});

await app.listen({ host: '127.0.0.1', port: 3101 });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { void app.close().finally(() => process.exit(0)); });
}

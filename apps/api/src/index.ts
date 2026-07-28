import Fastify from 'fastify';

const app = Fastify();
app.get('/health', async () => ({ ok: true }));

if (process.env.NODE_ENV !== 'test') {
  app.listen({ port: 4010, host: '127.0.0.1' }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default app;

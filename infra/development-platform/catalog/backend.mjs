import { createBackend } from '@backstage/backend-defaults';
import { rootHttpRouterServiceFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { createBackendModule } from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';

const readablePermissions = new Set([
  'catalog.entity.read',
  'catalog.location.read',
]);

const backend = createBackend();

// catalog.readonly alone still permits entity deletion, and refresh has no
// dedicated permission in this upstream version. Keep all catalog HTTP reads
// behind Backstage auth while removing externally callable mutations.
backend.add(rootHttpRouterServiceFactory({
  configure({ app, applyDefaults }) {
    app.use('/api/catalog', (request, response, next) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        response.status(405).json({ error: 'This catalog exposes read operations only' });
        return;
      }
      next();
    });
    applyDefaults();
  },
}));

backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(import('@backstage/plugin-permission-backend'));
backend.add(createBackendModule({
  pluginId: 'permission',
  moduleId: 'catalog-read-policy',
  register(registration) {
    registration.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy({
          async handle(request) {
            return {
              result: readablePermissions.has(request.permission.name)
                ? AuthorizeResult.ALLOW
                : AuthorizeResult.DENY,
            };
          },
        });
      },
    });
  },
}));

await backend.start();

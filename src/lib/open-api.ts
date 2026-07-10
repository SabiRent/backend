import { API_BASE_URL } from '@/config/env.config';
import { registry } from '@/lib/open-api-registry';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

let initialized = false;

const ensureDocsRegistered = () => {
  if (initialized) return;

  initialized = true;
};

export const generateOpenApiSpec = () => {
  ensureDocsRegistered();

  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'HAVN API',
      version: '1.0.0',
      description: '',
    },
    servers: [{ url: API_BASE_URL }],
    tags: [],
  });
};

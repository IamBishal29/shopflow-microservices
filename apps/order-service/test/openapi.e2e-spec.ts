import { INestApplication } from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { CreateOrderDto, CreateOrderItemDto } from '../src/orders/dto/create-order.dto';
import { ListOrdersQuery } from '../src/orders/dto/list-orders.query';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './test-app';

interface Schema {
  readonly properties?: Record<string, unknown>;
  readonly required?: readonly string[];
}
interface Operation {
  readonly parameters?: readonly { readonly name: string; readonly in: string }[];
  readonly responses: Record<string, { readonly content?: Record<string, unknown> }>;
}
interface OpenApiDocument {
  readonly openapi: string;
  readonly paths: Record<string, Record<string, Operation>>;
  readonly components: { readonly schemas: Record<string, Schema> };
}

/** Property names that class-validator checks: the rules the API really enforces. */
function validatedProperties(target: new () => object): string[] {
  const metadata = getMetadataStorage().getTargetValidationMetadatas(target, '', true, false);
  return [...new Set(metadata.map((m) => m.propertyName))].sort();
}

describe('OpenAPI docs (e2e)', () => {
  let app: INestApplication<App>;
  let spec: OpenApiDocument;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(PrismaService)
        .useValue({ onModuleInit: jest.fn(), onApplicationShutdown: jest.fn() }),
    );
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    spec = res.body as OpenApiDocument;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the Swagger UI at /docs', async () => {
    await request(app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('content-type', /text\/html/);
    // The page is useless if its static assets (swagger-ui-dist) are not served.
    await request(app.getHttpServer()).get('/docs/swagger-ui-bundle.js').expect(200);
  });

  it('lists the order endpoints', () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths['/orders'] ?? {}).sort()).toEqual(['get', 'post']);
    expect(Object.keys(spec.paths['/orders/{id}'] ?? {})).toEqual(['get']);
  });

  it('documents error responses as application/problem+json', () => {
    const findById = spec.paths['/orders/{id}']?.get;
    for (const status of ['400', '401', '404', '500']) {
      expect(findById?.responses[status]?.content).toHaveProperty(['application/problem+json']);
    }
    expect(spec.components.schemas.ProblemDetails?.required).toEqual(
      expect.arrayContaining(['type', 'title', 'status', 'code']),
    );
  });

  it('documents the caller identity header on reads', () => {
    const parameters = spec.paths['/orders']?.get?.parameters ?? [];
    expect(parameters).toContainEqual(
      expect.objectContaining({ name: 'x-customer-id', in: 'header' }),
    );
  });

  // Drift guard: a field validated by the DTO but missing from the docs (or the reverse)
  // fails here, not in a client integration.
  it.each([
    ['CreateOrderDto', CreateOrderDto],
    ['CreateOrderItemDto', CreateOrderItemDto],
  ])('documents exactly the fields %s validates', (name, dto) => {
    const documented = Object.keys(spec.components.schemas[name]?.properties ?? {}).sort();
    expect(documented).toEqual(validatedProperties(dto));
  });

  it('documents exactly the query parameters ListOrdersQuery validates', () => {
    const query = (spec.paths['/orders']?.get?.parameters ?? [])
      .filter((p) => p.in === 'query')
      .map((p) => p.name)
      .sort();
    expect(query).toEqual(validatedProperties(ListOrdersQuery));
  });
});

import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Code-first OpenAPI: the spec is generated from the controllers and DTOs that run, so it
 * cannot describe an endpoint that doesn't exist. UI at /docs, JSON spec at /docs-json.
 * Call before app.init()/listen() so the routes register ahead of the 404 handler.
 */
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('ShopFlow order-service')
    .setDescription(
      'Internal API, reached only through api-gateway (which authenticates the caller and ' +
        'sets customerId / x-customer-id from the JWT). Errors are RFC 9457 ' +
        'application/problem+json.',
    )
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: 'docs-json',
  });
}

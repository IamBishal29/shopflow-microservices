// Environment for api-gateway e2e tests, set before AppModule loads (like Docker/K8s).
process.env.ORDER_SERVICE_URL ??= 'http://localhost:3001';
process.env.JWT_SECRET ??= 'e2e-only-secret-not-used-anywhere-else';
process.env.REDIS_URL ??= 'redis://localhost:6379';

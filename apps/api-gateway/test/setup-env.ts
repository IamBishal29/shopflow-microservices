// Environment for api-gateway e2e tests, set before AppModule loads (like Docker/K8s).
process.env.ORDER_SERVICE_URL ??= 'http://localhost:3001';

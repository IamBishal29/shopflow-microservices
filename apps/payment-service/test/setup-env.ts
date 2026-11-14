// Environment for payment-service e2e tests, set before AppModule loads (like Docker/K8s).
process.env.PAYMENT_DATABASE_URL ??= 'postgresql://payments:payments@localhost:5432/payments';
process.env.KAFKA_BROKERS ??= 'localhost:9092';

// Environment for e2e tests. Real variables are set here, before AppModule loads,
// exactly as Docker or Kubernetes would provide them.
process.env.ORDER_DATABASE_URL ??= 'postgresql://shopflow:shopflow@localhost:5432/orders';
process.env.KAFKA_BROKERS ??= 'localhost:9092';

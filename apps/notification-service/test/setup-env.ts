// Environment for notification-service e2e tests, set before AppModule loads (like Docker/K8s).
process.env.NOTIFICATION_DATABASE_URL ??=
  'postgresql://notifications:notifications@localhost:5432/notifications';
process.env.KAFKA_BROKERS ??= 'localhost:9092';

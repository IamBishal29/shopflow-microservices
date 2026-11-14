// Prisma CLI config for order-service (migrate, generate). Tooling only: the running
// app gets its connection string from ConfigService, not from here.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Optional so `prisma generate` works without a database (CI, postinstall).
    url: process.env.ORDER_DATABASE_URL ?? '',
  },
});

export interface KafkaModuleOptions {
  /** host:port pairs; the client discovers the rest of the cluster from these. */
  readonly brokers: readonly string[];
  /** Shows up in broker logs and quotas; use the service name. */
  readonly clientId: string;
}

export const KAFKA_OPTIONS = Symbol('KAFKA_OPTIONS');
export const KAFKA_CLIENT = Symbol('KAFKA_CLIENT');

import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url().optional(),
  PG_URL: z.url().optional(),
  REDIS_URL: z.url().optional(),
  REDIS_URI: z.url().optional(),
  STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_BUCKET: z.string().min(1).optional(),
  STORAGE_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_SECRET_KEY: z.string().min(1).optional(),
  STORAGE_REGION: z.string().min(1).optional(),
  STORAGE_PUBLIC_URL: z.url().optional(),
  STORAGE_FORCE_PATH_STYLE: z.string().min(1).optional(),
  STORAGE_PRESIGN_EXPIRES_SECONDS: z.coerce.number().int().positive().optional(),
  AI_API_KEY: z.string().min(1).optional(),
  CLOUBIC_API_KEY: z.string().min(1).optional(),
  CLOUBIC_BASE_URL: z.url().optional(),
  CLOUBIC_TEXT_MODEL: z.string().min(1).optional(),
  CLOUBIC_IMAGE_MODEL: z.string().min(1).optional(),
  CLOUBIC_VIDEO_MODEL: z.string().min(1).optional(),
  OPENAI_GLOBAL_CONCURRENCY: z.coerce.number().int().positive().optional(),
  COMBINATION_ACTIVE_SHARD_LIMIT: z.coerce.number().int().positive().optional(),
  COMBINATION_ACTIVE_TASK_LIMIT: z.coerce.number().int().positive().optional(),
  WORKSPACE_ACTIVE_TASK_QUOTA: z.coerce.number().int().positive().optional(),
  MEDIA_POLL_BATCH_SIZE: z.coerce.number().int().positive().optional(),
  MEDIA_POLL_BACKLOG_LIMIT: z.coerce.number().int().positive().optional(),
  PROVIDER_CIRCUIT_MIN_SAMPLE_SIZE: z.coerce.number().int().positive().optional(),
  PROVIDER_CIRCUIT_FAILURE_RATE: z.coerce.number().positive().optional(),
  PROVIDER_CIRCUIT_CONSECUTIVE_FAILURES: z.coerce.number().int().positive().optional(),
  LOG_LEVEL: z.string().min(1).optional(),
  ENABLE_STRUCTURED_LOG: z.string().min(1).optional(),
  METRICS_ENABLED: z.string().min(1).optional(),
  INTERNAL_API_TOKEN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
});

const parsedServerEnv = serverEnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  PG_URL: process.env.PG_URL,
  REDIS_URL: process.env.REDIS_URL,
  REDIS_URI: process.env.REDIS_URI,
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY,
  STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY,
  STORAGE_REGION: process.env.STORAGE_REGION,
  STORAGE_PUBLIC_URL: process.env.STORAGE_PUBLIC_URL,
  STORAGE_FORCE_PATH_STYLE: process.env.STORAGE_FORCE_PATH_STYLE,
  STORAGE_PRESIGN_EXPIRES_SECONDS: process.env.STORAGE_PRESIGN_EXPIRES_SECONDS,
  AI_API_KEY: process.env.AI_API_KEY,
  CLOUBIC_API_KEY: process.env.CLOUBIC_API_KEY,
  CLOUBIC_BASE_URL: process.env.CLOUBIC_BASE_URL,
  CLOUBIC_TEXT_MODEL: process.env.CLOUBIC_TEXT_MODEL,
  CLOUBIC_IMAGE_MODEL: process.env.CLOUBIC_IMAGE_MODEL,
  CLOUBIC_VIDEO_MODEL: process.env.CLOUBIC_VIDEO_MODEL,
  OPENAI_GLOBAL_CONCURRENCY: process.env.OPENAI_GLOBAL_CONCURRENCY,
  COMBINATION_ACTIVE_SHARD_LIMIT: process.env.COMBINATION_ACTIVE_SHARD_LIMIT,
  COMBINATION_ACTIVE_TASK_LIMIT: process.env.COMBINATION_ACTIVE_TASK_LIMIT,
  WORKSPACE_ACTIVE_TASK_QUOTA: process.env.WORKSPACE_ACTIVE_TASK_QUOTA,
  MEDIA_POLL_BATCH_SIZE: process.env.MEDIA_POLL_BATCH_SIZE,
  MEDIA_POLL_BACKLOG_LIMIT: process.env.MEDIA_POLL_BACKLOG_LIMIT,
  PROVIDER_CIRCUIT_MIN_SAMPLE_SIZE: process.env.PROVIDER_CIRCUIT_MIN_SAMPLE_SIZE,
  PROVIDER_CIRCUIT_FAILURE_RATE: process.env.PROVIDER_CIRCUIT_FAILURE_RATE,
  PROVIDER_CIRCUIT_CONSECUTIVE_FAILURES: process.env.PROVIDER_CIRCUIT_CONSECUTIVE_FAILURES,
  LOG_LEVEL: process.env.LOG_LEVEL,
  ENABLE_STRUCTURED_LOG: process.env.ENABLE_STRUCTURED_LOG,
  METRICS_ENABLED: process.env.METRICS_ENABLED,
  INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN,
  CRON_SECRET: process.env.CRON_SECRET,
});

function requireValue(value: string | undefined, message: string) {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function sanitizeConnectionUrl(value: string) {
  const url = new URL(value);

  url.searchParams.delete("directConnection");

  return url.toString();
}

function parseBooleanFlag(value: string | undefined, defaultValue: boolean) {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

export const env = {
  nodeEnv: parsedServerEnv.NODE_ENV,
  databaseUrl: sanitizeConnectionUrl(
    requireValue(
      parsedServerEnv.DATABASE_URL ?? parsedServerEnv.PG_URL,
      "Missing database connection string. Set DATABASE_URL or PG_URL.",
    ),
  ),
  redisUrl: parsedServerEnv.REDIS_URL ?? parsedServerEnv.REDIS_URI,
  storageEndpoint: parsedServerEnv.STORAGE_ENDPOINT,
  storageBucket: parsedServerEnv.STORAGE_BUCKET,
  storageAccessKey: parsedServerEnv.STORAGE_ACCESS_KEY,
  storageSecretKey: parsedServerEnv.STORAGE_SECRET_KEY,
  storageRegion: parsedServerEnv.STORAGE_REGION ?? "us-east-1",
  storagePublicUrl: parsedServerEnv.STORAGE_PUBLIC_URL,
  storageForcePathStyle: parseBooleanFlag(parsedServerEnv.STORAGE_FORCE_PATH_STYLE, true),
  storagePresignExpiresSeconds: parsedServerEnv.STORAGE_PRESIGN_EXPIRES_SECONDS ?? 900,
  cloubicApiKey: parsedServerEnv.CLOUBIC_API_KEY ?? parsedServerEnv.AI_API_KEY,
  cloubicBaseUrl: parsedServerEnv.CLOUBIC_BASE_URL ?? "https://api.cloubic.com/v1",
  cloubicTextModel: parsedServerEnv.CLOUBIC_TEXT_MODEL ?? "gpt-4o",
  cloubicImageModel: parsedServerEnv.CLOUBIC_IMAGE_MODEL ?? "gemini-3-pro-image-preview",
  cloubicVideoModel: parsedServerEnv.CLOUBIC_VIDEO_MODEL ?? "kling-v3-omni-pro",
  openAIGlobalConcurrency: parsedServerEnv.OPENAI_GLOBAL_CONCURRENCY ?? 50,
  combinationActiveShardLimit: parsedServerEnv.COMBINATION_ACTIVE_SHARD_LIMIT ?? 2,
  combinationActiveTaskLimit: parsedServerEnv.COMBINATION_ACTIVE_TASK_LIMIT ?? 12,
  workspaceActiveTaskQuota: parsedServerEnv.WORKSPACE_ACTIVE_TASK_QUOTA ?? 20,
  mediaPollBatchSize: parsedServerEnv.MEDIA_POLL_BATCH_SIZE ?? 10,
  mediaPollBacklogLimit: parsedServerEnv.MEDIA_POLL_BACKLOG_LIMIT ?? 40,
  providerCircuitMinSampleSize: parsedServerEnv.PROVIDER_CIRCUIT_MIN_SAMPLE_SIZE ?? 8,
  providerCircuitFailureRate: parsedServerEnv.PROVIDER_CIRCUIT_FAILURE_RATE ?? 0.6,
  providerCircuitConsecutiveFailures: parsedServerEnv.PROVIDER_CIRCUIT_CONSECUTIVE_FAILURES ?? 5,
  logLevel: parsedServerEnv.LOG_LEVEL ?? "info",
  enableStructuredLog: parseBooleanFlag(parsedServerEnv.ENABLE_STRUCTURED_LOG, parsedServerEnv.NODE_ENV !== "test"),
  metricsEnabled: parseBooleanFlag(parsedServerEnv.METRICS_ENABLED, true),
  internalApiToken: parsedServerEnv.INTERNAL_API_TOKEN,
  cronSecret: parsedServerEnv.CRON_SECRET,
};

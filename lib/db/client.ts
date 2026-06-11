import postgres from "postgres";

/**
 * Creates the postgres-js client. On Cloud Run the Cloud SQL connection is a
 * unix socket whose path can't be expressed in a URL this postgres-js version
 * understands, so it's passed separately via POSTGRES_SOCKET_HOST
 * (e.g. /cloudsql/project:region:instance) and overrides the URL's host.
 */
export function createPgClient(options: Parameters<typeof postgres>[1] = {}) {
  const socketHost = process.env.POSTGRES_SOCKET_HOST;
  return postgres(process.env.POSTGRES_URL ?? "", {
    ...(socketHost ? { host: socketHost } : {}),
    ...options,
  });
}

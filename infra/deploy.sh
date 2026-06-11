#!/usr/bin/env bash
# TutorRoom — deploy to Cloud Run.
# Prereqs (already created): project, billing, APIs, Cloud SQL teachflow-sql,
# bucket, Pub/Sub topic, service accounts + IAM (see infra/README notes).
set -euo pipefail

PROJECT=teachflow-hack-611
REGION=us-central1
ACCOUNT=ipuncho@gmail.com
SERVICE=tutorroom
SQL_INSTANCE=$PROJECT:$REGION:teachflow-sql
BUCKET=$PROJECT-videos
RUN_SA=teachflow-run@$PROJECT.iam.gserviceaccount.com
PUSH_SA=pubsub-push@$PROJECT.iam.gserviceaccount.com

: "${POSTGRES_URL_PROD:?set POSTGRES_URL_PROD (unix-socket Cloud SQL URL)}"
: "${GEMINI_API_KEY:?set GEMINI_API_KEY}"
: "${AUTH_SECRET_PROD:?set AUTH_SECRET_PROD}"

gcloud run deploy "$SERVICE" \
  --source . \
  --project="$PROJECT" --region="$REGION" --account="$ACCOUNT" \
  --service-account="$RUN_SA" \
  --add-cloudsql-instances="$SQL_INSTANCE" \
  --allow-unauthenticated \
  --timeout=600 --memory=2Gi --cpu=2 \
  --min-instances=1 --max-instances=1 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT,GCS_BUCKET=$BUCKET,PUBSUB_TOPIC=video-analyze,PUBSUB_MODE=${PUBSUB_MODE:-pubsub},PUBSUB_PUSH_SA_EMAIL=$PUSH_SA,USE_ADK=${USE_ADK:-1}" \
  --set-env-vars="^|^POSTGRES_URL=$POSTGRES_URL_PROD" \
  --set-env-vars="POSTGRES_SOCKET_HOST=/cloudsql/$SQL_INSTANCE" \
  --set-env-vars="GOOGLE_GENERATIVE_AI_API_KEY=$GEMINI_API_KEY,GOOGLE_API_KEY=$GEMINI_API_KEY,AUTH_SECRET=$AUTH_SECRET_PROD"

URL=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --account="$ACCOUNT" --format='value(status.url)')
echo "Deployed: $URL"

# Pub/Sub push subscription (idempotent-ish; ignore AlreadyExists)
gcloud run services add-iam-policy-binding "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --account="$ACCOUNT" \
  --member="serviceAccount:$PUSH_SA" --role=roles/run.invoker --quiet || true

gcloud pubsub subscriptions create video-analyze-push \
  --project="$PROJECT" --account="$ACCOUNT" \
  --topic=video-analyze \
  --push-endpoint="$URL/api/pubsub/video-analyze" \
  --push-auth-service-account="$PUSH_SA" \
  --ack-deadline=600 --min-retry-delay=60s || true

gcloud run services update "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --account="$ACCOUNT" \
  --update-env-vars="PUSH_ENDPOINT_URL=$URL/api/pubsub/video-analyze,NEXTAUTH_URL=$URL" --quiet

echo "Done. $URL"

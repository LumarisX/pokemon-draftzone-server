# S3 upload infrastructure setup

Companion to `S3Service` / `UploadsModule`. The app's own credentials
(`draftzone-backend-s3-uploader`) are intentionally scoped to object-level
S3 actions only — confirmed by `AccessDenied` on `GetBucketCors`,
`GetBucketPolicy`, `GetPublicAccessBlock`, and `GetBucketLocation`. None of
the steps below can be run with those credentials; run them yourself with
an admin profile (you have `AdministratorAccess-446492582222` configured
locally).

## 1. Bucket CORS (required for direct browser-to-S3 PUT uploads)

Allows the presigned-PUT flow used by `S3Service.getPresignedUploadUrl` to
work from the browser. Without this, uploads will fail with a CORS error
even though the presigned URL itself is valid.

```sh
aws s3api put-bucket-cors \
  --bucket pokemondraftzone-public \
  --cors-configuration file://s3-bucket-cors.json \
  --profile AdministratorAccess-446492582222
```

Origins in `s3-bucket-cors.json` are copied from the server's
`ALLOWED_ORIGINS` env var. Update both together if that ever changes (e.g.
adding a `www.` variant).

## 2. IAM least-privilege policy for the uploader user

`s3-uploader-iam-policy.json` grants exactly what `S3Service` uses:
`PutObject`, `GetObject` (also covers `HeadObject`), `DeleteObject` — scoped
to this bucket's objects only. No bucket-level admin actions, no
`ListBucket` (unused by the code).

**Before applying:** check the IAM console (Users → `draftzone-backend-s3-uploader`
→ Permissions) for what's currently attached. If it's already an inline
policy with the same name, this will overwrite it — diff first if you've
hand-tuned it before.

```sh
aws iam put-user-policy \
  --user-name draftzone-backend-s3-uploader \
  --policy-name s3-uploads-least-privilege \
  --policy-document file://s3-uploader-iam-policy.json \
  --profile AdministratorAccess-446492582222
```

## 3. CloudFront (optional CDN in front of the bucket)

You weren't sure whether this bucket already sits behind CloudFront (your
other bucket, for the web client, does). **Check first** — AWS console →
CloudFront → look for a distribution whose origin is
`pokemondraftzone-public.s3.us-east-2.amazonaws.com`. If one already
exists, just grab its domain name and skip to the last step.

If none exists, `cloudfront-distribution-config.json` creates one using
the default `*.cloudfront.net` domain (no ACM cert or DNS record needed).
The bucket is already public-read (the app constructs direct public S3
URLs today), so this is a plain S3-origin distribution — no Origin Access
Control needed.

```sh
# CallerReference must be unique - the value below is a placeholder, replace it
aws cloudfront create-distribution \
  --distribution-config file://cloudfront-distribution-config.json \
  --profile AdministratorAccess-446492582222
```

Takes ~10-20 minutes to deploy globally (`Status` goes `InProgress` →
`Deployed`). Then take the returned `DomainName` and set it as the public
base URL everywhere the server runs:

```
AWS_S3_PUBLIC_BASE_URL=https://<distribution-domain>.cloudfront.net
```

`S3Service.getPublicUrl()` already prefers this env var when present and
falls back to the raw bucket URL when it's unset, so this is a no-code-change,
purely operational step.

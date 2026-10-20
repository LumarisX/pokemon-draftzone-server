# Database Backups

**Status (2026-10-13): planned, not set up.** The workflow exists but only runs by hand, and fails
until the one-time setup below is done; the nightly schedule is switched on in its last step.
Until then, take manual exports, and always one before a script's `--apply`.

The `draftzone` database is backed up by `.github/workflows/db-backup.yml`:

- **Nightly** at 10:00 UTC (3 AM Pacific in summer, 2 AM in winter), kept **30 days**.
- **Labelled**, on demand, kept **one year**. Take one before any migration, bulk script or other
  large change:

  ```
  gh workflow run db-backup.yml -R <owner>/pokemon-draftzone-server -f label=before-outcomes-backfill
  ```

  or Actions → Database Backup → Run workflow in GitHub.

Each run writes one gzipped `mongodump` archive of every collection to
`s3://<DB_BACKUP_BUCKET>/db-backups/nightly/` or `.../labelled/`, named by UTC time (and label).
The run fails, and GitHub emails you, if the dump is under 1 MB or the upload doesn't match.

The cluster is on Atlas's free tier, which has no built-in backups, so these files are the only
fallback. The PDBL S3 Singles playoff bracket was lost on 2026-06-27 because the only copy was
deleted by a cleanup script and no backup predated it.

## One-Time Setup

1. **A read-only database user.** Atlas → Database Access → Add New Database User: name
   `pdz-backup`, password auth, built-in role **Only read any database**. The app's own user can
   write, so the backup job doesn't use it.
2. **Network access.** Atlas → Network Access must let GitHub's runners connect. Their IPs change
   on every run, so this needs `0.0.0.0/0`. If the list is restricted today, either allow that
   (the backup user is read-only, with a long random password) or tell me and the job can move
   onto the EC2 box instead.
3. **A private bucket.** S3 → Create bucket in `us-east-2`, for example
   `pokemondraftzone.backups`, with Block all public access **on**. Keep backups out of the
   uploads bucket, which serves files to the site.
4. **Retention.** On that bucket, add this lifecycle configuration (console: Management →
   Lifecycle rules, or `aws s3api put-bucket-lifecycle-configuration --bucket <bucket>
   --lifecycle-configuration file://lifecycle.json`):

   ```json
   {
     "Rules": [
       {
         "ID": "nightly-30-days",
         "Filter": { "Prefix": "db-backups/nightly/" },
         "Status": "Enabled",
         "Expiration": { "Days": 30 }
       },
       {
         "ID": "labelled-1-year",
         "Filter": { "Prefix": "db-backups/labelled/" },
         "Status": "Enabled",
         "Expiration": { "Days": 365 }
       }
     ]
   }
   ```

5. **Let the GitHub role write there.** IAM → the role in the `AWS_ROLE_ARN` secret (the one the
   deploy workflow assumes) → add this inline policy:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject"],
         "Resource": "arn:aws:s3:::<bucket>/db-backups/*"
       }
     ]
   }
   ```

   `GetObject` is only there so the job can check the upload's size.
6. **GitHub settings** (repository → Settings → Secrets and variables → Actions):
   - Secret `MONGODB_BACKUP_URI`:
     `mongodb+srv://pdz-backup:<password>@draftzonedatabase.5nc6cbu.mongodb.net/?retryWrites=true&w=majority&appName=DraftzoneBackup`.
     URL-encode the password if it has symbols, and leave no database name after the host (the
     job passes `--db=draftzone`).
   - Variable `DB_BACKUP_BUCKET`: the bucket name.
7. **Test it.** Push the workflow to `main`, then run it by hand with `label=first-test`. The run
   summary shows the S3 path and size.
8. **Turn on the nightly run.** Once the test passes, add the schedule to the workflow's `on:` block
   and push (schedules only fire from the default branch):

   ```yaml
   on:
     schedule:
       - cron: "0 10 * * *"
     workflow_dispatch:
   ```

## Restoring

Never restore over the live `draftzone` database. Restore into a separate database, look at what
you need, copy the specific records back with a reviewed script, then drop the copy.

1. Find the backup: `aws s3 ls s3://<bucket>/db-backups/labelled/` (or `nightly/`).
2. Download it: `aws s3 cp s3://<bucket>/db-backups/.../<name>.archive.gz .`
3. Restore everything into `draftzone_restore`:

   ```
   mongorestore --uri="<a URI for a user that can write>" --archive=<name>.archive.gz --gzip \
     --nsFrom="draftzone.*" --nsTo="draftzone_restore.*"
   ```

   Or one collection only, by adding `--nsInclude="draftzone.leaguetournaments"`.
4. Inspect `draftzone_restore` in Compass or with a script.
5. Drop it when done: `mongosh "<uri>" --eval 'db.getSiblingDB("draftzone_restore").dropDatabase()'`.
   The free tier caps storage at 512 MB, so don't leave copies lying around.

`mongodump`/`mongorestore` come from the MongoDB Database Tools (the workflow pins 100.12.2).

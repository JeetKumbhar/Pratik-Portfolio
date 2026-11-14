# Pratik Shelke Photography — Cloudinary to Cloudflare R2 Migration Plan

**Project:** Pratik Shelke Photography (MERN)  
**Goal:** Replace Cloudinary as the original-photo storage provider with Cloudflare R2, while preserving existing portfolio functionality and delivering optimized images to visitors.  
**Important:** This is an implementation plan, not permission to migrate production data immediately. Claude must inspect the repository first, work in small approved phases, and must not push or deploy.

---

## 0. Target architecture and decisions

### Desired architecture

1. The photographer selects original photographs in the existing Admin > Portfolio interface.
2. The authenticated backend validates the admin, requested file metadata, file type, and size.
3. The backend generates a short-lived, single-object R2 presigned upload URL.
4. The browser uploads the file directly to R2. The 25–40 MB file does not pass through the Render backend.
5. The frontend calls a finalize endpoint.
6. The backend verifies that the uploaded R2 object exists and has the expected size/content type, then creates or updates the portfolio record in MongoDB.
7. Public portfolio pages display optimized image URLs while original files remain stored in R2.
8. Existing Cloudinary records continue to work during migration and rollback.

### Storage and delivery

- **Original storage:** Cloudflare R2.
- **Public delivery:** A Cloudflare R2 bucket connected to a dedicated custom domain, for example `media.example.com`, after the domain and DNS are confirmed.
- **Image optimization:** Prefer Cloudflare Images transformations for images stored outside Images (R2). Cloudflare documents a Free transformations allowance of 5,000 unique transformations per month. Confirm current account availability, pricing, zone setup, and limits before enabling it.
- **MongoDB:** Store provider-neutral asset metadata and retain existing fields needed by the current frontend until a compatibility migration is completed.
- **Render:** Keeps application APIs and signing credentials; large file bytes should upload directly from the browser to R2.

Do not assume that R2 itself automatically resizes or converts images. R2 is object storage. Image transformations/delivery are a separate layer.

### File-size policy

- Initial supported maximum: **40 MB per image**, configurable on the backend.
- Reject files above the configured maximum with a clear message.
- A 40 MB object is comfortably within R2's single `PUT` upload limit. R2 single uploads support objects up to 5 GiB; multipart uploads support larger objects and resumability.
- For this project's 25–40 MB images, begin with a presigned single `PUT`. Add multipart upload only if real testing demonstrates a need for resumability or files become substantially larger.
- Never claim chunking bypasses an account or service limit.

### Security rules

- R2 Access Key ID and Secret Access Key must exist only in Render environment variables and local ignored `.env` files.
- Never put R2 credentials in Vite variables, frontend source, ZIPs, Git, logs, screenshots, or browser responses.
- Only authenticated admins can request upload signatures, finalize uploads, or delete assets.
- Presigned URLs are bearer credentials. Use short expiry (for example 5–10 minutes), one object key, one method, and the intended content type.
- Use cryptographically random object keys. Do not trust a client-supplied path or filename as the storage key.
- Configure bucket CORS for the exact production frontend origin(s) and local development origin(s), only the required methods and headers.
- Public-read access is only for portfolio media intended to be public. Do not store private client documents or sensitive material in the public portfolio bucket.
- Do not expose bucket listing. Public viewers should only fetch known object URLs.
- Validate file signatures/magic bytes where practical; do not trust file extension or browser MIME type alone.
- Apply upload count/rate limits and maximum file count per request.
- Do not log presigned URLs, credentials, or full sensitive request data.

---

## Phase 1 — Repository audit and migration design (NO CODE CHANGES)

### Tasks

1. Inspect the complete repository and identify:
   - Frontend portfolio upload components and API calls.
   - Backend upload routes, controllers, middleware, validation, and Cloudinary utility/configuration.
   - MongoDB models and all image-related fields.
   - Portfolio display components on Home, Portfolio, service/category pages, and admin previews.
   - Featured image logic, gallery ordering, image replacement, and deletion.
   - Blog images or other Cloudinary uses, if any.
   - Any image URLs or Cloudinary public IDs used by other features.
   - Existing tests and environment variable conventions.
2. Trace every Cloudinary operation:
   - Upload
   - Delete
   - Replace/update
   - Thumbnail/optimized URL generation
   - Any signed upload or transformation flow
3. Identify current MongoDB schema and actual production data compatibility. Do not infer schema from filenames alone.
4. Identify whether Cloudinary is used for anything beyond portfolio photos. Do not migrate unrelated assets without a separate decision.
5. Propose the R2 object-key convention, such as:
   `portfolio/{year}/{month}/{random-id}.{extension}`
6. Propose a provider-neutral asset shape, adapting to the existing schema rather than blindly replacing it. Suggested metadata:
   - `provider`: `cloudinary` or `r2`
   - `storageKey` / `objectKey`
   - `publicUrl` or delivery URL
   - `originalFilename` (display metadata only; never use as trusted key)
   - `mimeType`
   - `sizeBytes`
   - `width`, `height` (when known)
   - `etag` (where available; do not treat multipart ETag as an MD5 checksum)
   - `uploadedAt`
   - existing Cloudinary `public_id` retained for legacy records
7. Identify all compatibility risks and provide a phased implementation proposal.

### Phase 1 deliverable

Provide:
- Upload and display architecture map.
- Exact files/modules involved.
- Existing database field mapping.
- Environment variables required (names only, never values).
- Risks, migration plan, rollback plan, test plan.
- Whether Cloudflare Images transformation setup is possible with the intended domain/account.

**STOP after Phase 1. Do not edit files. Wait for approval.**

---

## Phase 2 — Cloudflare account and R2 setup guide (NO APP CODE CHANGES)

Claude should provide step-by-step dashboard instructions for the user to complete. Do not ask the user to paste credentials into chat.

### User setup checklist

1. Create or select the Cloudflare account.
2. Create an R2 bucket with a clear production name, e.g. `pratik-photography-originals`.
3. Keep public access disabled until the delivery design and custom domain are confirmed.
4. Create an R2 API token with the minimum bucket permissions needed for the app:
   - Object read/write for the intended bucket.
   - Delete permission only if the app needs to delete objects.
   - Do not grant account-wide permissions unnecessarily.
5. Record the credentials locally and add them to Render environment variables later:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
   - `R2_S3_ENDPOINT` (account-specific S3 endpoint)
   - `R2_PUBLIC_BASE_URL` (custom media domain after configured)
   - `R2_UPLOAD_MAX_BYTES` (initially 41943040)
6. Configure a custom domain for public portfolio delivery after confirming the user owns and controls the domain/DNS. Do not invent a domain.
7. Configure bucket CORS for the exact frontend origins. Allow only required `PUT`, `GET`, and `HEAD` methods as needed and required headers such as `Content-Type`. Do not use wildcard origins in production.
8. Confirm the bucket is not listable publicly.
9. If using Cloudflare Images transformations:
   - Enable transformations for the correct zone.
   - Add/allow the R2 custom-domain origin as required.
   - Confirm the Free allowance and current pricing.
   - Test one original and multiple output sizes/formats.
10. Do not delete, rename, or modify the Cloudinary account or existing assets.

**STOP after producing setup instructions. Wait for the user to confirm setup is complete.**

---

## Phase 3 — Backend R2 upload foundation

### Implementation

1. Add the AWS SDK for JavaScript v3 S3 client packages only if not already present:
   - `@aws-sdk/client-s3`
   - `@aws-sdk/s3-request-presigner`
2. Create a reusable R2 storage service module. Keep provider-specific code out of route handlers.
3. Configure the S3-compatible R2 endpoint and region `auto`.
4. Add an authenticated admin endpoint to request an upload:
   - Validate authentication and admin authorization.
   - Validate allowed image MIME types and extension.
   - Validate size is greater than zero and at most configured limit (initially 40 MiB).
   - Generate a random object key on the server.
   - Generate a short-lived presigned `PUT` URL for that exact key and content type.
   - Return only the upload URL, object key, expiry, required headers, and safe metadata.
5. Add an authenticated finalize endpoint:
   - Confirm the object key belongs to the permitted portfolio namespace and is associated with an outstanding upload intent.
   - Use `HeadObject` to verify existence, content length, and content type.
   - Validate the size and expected metadata again.
   - Save the R2 asset metadata to MongoDB only after verification.
   - Make finalization idempotent so a retry cannot create duplicate portfolio records.
6. Add upload-intent tracking with expiry or another safe mechanism so users cannot finalize arbitrary object keys.
7. Add authenticated deletion:
   - Verify the asset is referenced by the correct portfolio record and belongs to this bucket/prefix.
   - Delete the R2 object server-side.
   - Handle database/storage partial failures safely and log a recoverable state.
8. Add validation and safe error responses. Never return SDK errors, credentials, or signed URLs in logs.
9. Add cleanup for expired incomplete upload intents and orphaned objects. Prefer a dry-run report first; do not automatically delete production objects without approval.
10. Keep existing Cloudinary upload and delete paths available during this phase.

### Backend tests

- Unauthorized user cannot request a signature, finalize, or delete.
- Non-admin user cannot upload.
- Invalid MIME type and oversized file rejected.
- 40 MB file metadata accepted; over-limit rejected.
- Signature is restricted to one key, method, content type, and short expiry.
- Finalize rejects missing object, wrong size, wrong content type, and unknown upload intent.
- Finalize retry does not duplicate records.
- Delete cannot target arbitrary bucket keys.
- R2 errors are handled without leaking secrets.
- Existing Cloudinary tests and routes continue to pass.

**STOP after Phase 3. Provide changed files, tests, and a ZIP. Wait for approval.**

---

## Phase 4 — Frontend direct upload integration

### Implementation

1. Update the existing Admin > Portfolio upload flow to use the new backend upload-intent endpoint.
2. Upload file bytes directly from the browser to the presigned R2 URL using `PUT`.
3. Send exactly the signed `Content-Type` header.
4. Call the finalize endpoint only after the browser receives a successful R2 response.
5. Display:
   - Per-file upload progress.
   - Uploaded / failed / pending states.
   - Clear maximum-size guidance (40 MB initially).
   - Retry action for failed files.
   - Useful errors for expired signatures, CORS, network failures, and size validation.
6. Support the existing multi-file workflow if it exists. Limit concurrent uploads to a modest number to avoid overwhelming the browser/network.
7. Prevent double-clicks and duplicate finalization.
8. Do not block the whole admin UI during upload.
9. Preserve existing captions, categories, service associations, featured toggles, visibility toggles, ordering, and all other portfolio metadata.
10. Do not change the overall design unless needed for upload progress/error states.

### Frontend tests

- Single 25 MB and 40 MB upload.
- Multiple uploads with limited concurrency.
- Progress display and completion.
- Retry after network failure or expired URL.
- No database record before successful upload/finalization.
- No duplicate record after retry.
- Existing portfolio edit and preview continue to work.

**STOP after Phase 4. Provide changed files, tests, and a ZIP. Wait for approval.**

---

## Phase 5 — Image delivery and optimization

### Preferred approach

Use Cloudflare Images transformations for R2-hosted originals if the account/domain configuration supports it and the current Free allowance is acceptable.

1. Keep the R2 original untouched.
2. Create a central image URL builder/service. Do not construct transformation URLs independently throughout components.
3. Support named presentation sizes, for example:
   - `thumbnail`: small admin/list preview.
   - `card`: portfolio grid.
   - `hero`: homepage/large feature.
   - `full`: larger viewing experience.
4. Use responsive `srcset`/`sizes` where appropriate.
5. Request automatic format and quality where supported (e.g. AVIF/WebP negotiation), while preserving a reliable fallback.
6. Set sensible width limits for each UI placement; do not send 40 MB originals to normal gallery cards.
7. Preserve the original URL for full-resolution download/admin use only if that feature already exists and is authorized.
8. Set cache headers and cache policy carefully. Since object keys are immutable/random, long-lived caching is suitable for unchanged objects.
9. If Cloudflare Images transformations are unavailable or unsuitable, provide an alternative delivery design and cost estimate before implementing another paid service.
10. Avoid relying on ImageKit Free as permanent storage for originals. If ImageKit is considered only as a transformation/delivery layer with R2 as external origin, verify its external-storage behavior, limits, and pricing first.

### Validation

- Confirm public image URLs load on the live frontend origin.
- Confirm mobile receives appropriately sized output.
- Confirm image quality is acceptable for wedding photography.
- Confirm transformations do not overwrite the R2 original.
- Check transformation usage/allowance and bandwidth expectations.

**STOP after Phase 5. Provide tests and a ZIP. Wait for approval.**

---

## Phase 6 — Backward compatibility and data migration

Do not migrate all production assets immediately.

### Compatibility first

1. Make the frontend image resolver support both:
   - Legacy Cloudinary records.
   - New R2 records.
2. Keep existing Cloudinary URLs working unchanged.
3. Ensure all existing portfolio pages, homepage featured images, service categories, blog posts, and admin previews use the shared resolver.
4. Preserve old MongoDB records and IDs. Do not rename/delete existing fields until all consumers are confirmed updated.

### Migration tooling

Create a migration script that:
- Defaults to dry-run.
- Lists Cloudinary assets and corresponding MongoDB records.
- Reports count, total bytes, missing assets, duplicate references, and unsupported formats.
- Copies original bytes from Cloudinary to R2 without recompressing or changing the original.
- Verifies each R2 object using size and preferably a cryptographic checksum computed from downloaded bytes; do not assume ETag is always an MD5.
- Updates the relevant MongoDB record to include R2 metadata only after verification.
- Retains the original Cloudinary metadata/URL during the migration window.
- Is restartable and idempotent.
- Supports small batches and rate limits.
- Writes a migration report.
- Has a rollback mode that restores the previous provider metadata, without deleting R2 objects.

### Migration execution

1. Run dry-run against a safe environment.
2. Test with 3–5 representative images, including a large original.
3. Compare dimensions, file size, checksum, and visual output.
4. Confirm public website and admin behavior.
5. Only then migrate production in small batches with user approval.
6. Do not bulk-delete Cloudinary assets as part of migration.

**STOP after Phase 6 implementation and dry-run. Wait for explicit approval before production migration.**

---

## Phase 7 — Cutover, monitoring, and rollback

### Cutover checklist

- R2 uploads work from the deployed admin interface.
- 25 MB and 40 MB uploads work.
- Admin authorization is enforced.
- Public delivery domain and transformations work.
- All migrated images are verified.
- New uploads create valid MongoDB records.
- Edit, delete, feature-on-home, visibility, ordering, categories and service filtering work.
- No broken images on Home, Portfolio, Services, Blog or admin.
- No secrets in frontend bundle or Git.
- Render logs do not contain credentials or presigned URLs.
- Cloudflare usage and limits are understood.

### Rollback

- Keep Cloudinary credentials and old assets available during the agreed rollback window.
- Keep provider metadata so the resolver can serve Cloudinary and R2 assets.
- If R2 upload or delivery fails, disable new R2 uploads with a server-side feature flag and restore Cloudinary uploads.
- Do not delete R2 objects during rollback.
- Do not delete Cloudinary originals until the user explicitly approves after successful production verification and backup.

**Production cutover and Cloudinary cleanup require separate explicit approval.**

---

## Phase 8 — Final Cloudinary retirement (separate approval required)

Only after the user confirms the new system has worked reliably in production:

1. Search the whole repository for Cloudinary references.
2. Categorize each reference as:
   - Legacy asset compatibility still required.
   - No longer used.
   - Unrelated feature still using Cloudinary.
3. Remove Cloudinary upload dependencies/configuration only when no active feature requires them.
4. Keep legacy Cloudinary URL rendering for historical records unless all assets have been migrated and verified.
5. Remove Cloudinary environment variables from Render only after confirming no active code path uses them.
6. Do not delete the Cloudinary account or stored assets until the user explicitly requests it.
7. Update `.env.example`, setup documentation, deployment documentation, and admin upload documentation. Never include real secrets.
8. Run the full backend test suite and frontend production build.

---

## Required environment variable names

Claude must inspect naming conventions and adapt if appropriate. Never invent or expose values.

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_S3_ENDPOINT=
R2_PUBLIC_BASE_URL=
R2_UPLOAD_MAX_BYTES=41943040
```

These values belong in local ignored `.env` and Render environment settings only. Do not commit `.env`.

---

## Global rules for Claude

1. **Inspect before editing.** Never assume the current repository matches an earlier report.
2. Work only from the latest repository/ZIP supplied by the user.
3. Do not overwrite unrelated local changes or remove untracked files.
4. Do not push to GitHub or deploy to Render.
5. Do not modify live Cloudinary assets or production MongoDB data without explicit approval.
6. Do not ask the user to paste secrets into chat. Give dashboard instructions and ask them to configure secrets directly.
7. Do not claim a test passed unless it was actually run; distinguish mocked tests from real R2 tests.
8. Keep existing portfolio design and functionality unchanged.
9. After each phase, provide:
   - What changed.
   - Exact files added/modified.
   - Commands run and actual results.
   - Tests not run and why.
   - Known risks or manual setup still required.
   - A ZIP with correct project folder structure.
10. Stop at each phase gate and wait for approval before continuing.
11. If Claude's usage limit is reached, stop cleanly. Record the exact phase, completed tasks, changed files, test results, pending tasks, and the next command. On resume, inspect the working tree and continue from that checkpoint; do not restart or overwrite completed work.
12. Before producing a ZIP, verify its contents and ensure no `.env`, credentials, build artifacts, `node_modules`, or unrelated files are included.

## Official technical references

Use current official documentation during implementation; do not rely on memory for SDK APIs or account limits.

- R2 overview: https://developers.cloudflare.com/r2/
- R2 upload methods: https://developers.cloudflare.com/r2/objects/upload-objects/
- R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- R2 public buckets/custom domains: https://developers.cloudflare.com/r2/buckets/public-buckets/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Images overview: https://developers.cloudflare.com/images/
- Cloudflare Images transformations: https://developers.cloudflare.com/images/optimization/transformations/overview/
- Cloudflare Images pricing: https://developers.cloudflare.com/images/pricing/

**Start with Phase 1 only. Do not begin implementation until the user approves the audit and architecture.**

/**
 * packages/shared/src/storage/s3.js — S3-compatible storage adapter (Phase 4 / v1.1)
 *
 * Implements the same interface as LocalStorage for S3/MinIO/Cloudflare R2.
 * Requires @aws-sdk/client-s3 to be installed.
 *
 * Environment variables:
 *   S3_BUCKET     — bucket name (required)
 *   S3_REGION     — AWS region (default: us-east-1)
 *   S3_ENDPOINT   — custom endpoint for S3-compatible providers (e.g. Cloudflare R2)
 *   S3_CDN_URL    — base CDN URL for public asset URLs (e.g. https://cdn.example.com)
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY — credentials
 */
export class S3Storage {
  constructor({ bucket, region, endpoint, cdnUrl } = {}) {
    this.bucket  = bucket  || process.env.S3_BUCKET;
    this.region  = region  || process.env.S3_REGION  || 'us-east-1';
    this.endpoint = endpoint || process.env.S3_ENDPOINT;
    this.cdnUrl  = (cdnUrl || process.env.S3_CDN_URL || '').replace(/\/$/, '');

    if (!this.bucket) throw new Error('S3Storage: S3_BUCKET is required');
  }

  // Lazy-load the AWS SDK so it doesn't need to be installed for local-only deployments
  async #client() {
    if (this._client) return this._client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this._client = new S3Client({
      region:   this.region,
      endpoint: this.endpoint,
      forcePathStyle: !!this.endpoint, // required for MinIO / R2
    });
    return this._client;
  }

  async read(p) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.#client();
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: p }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async write(p, data) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.#client();
    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key:    p,
      Body:   data,
    }));
  }

  async exists(p) {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.#client();
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: p }));
      return true;
    } catch { return false; }
  }

  async list(prefix) {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const client = await this.#client();
    const res = await client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
    return (res.Contents || []).map(o => o.Key);
  }

  async delete(p) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.#client();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: p }));
  }

  url(p) {
    if (this.cdnUrl) return `${this.cdnUrl}/${p}`;
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${p}`;
  }
}

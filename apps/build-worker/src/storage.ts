/**
 * 对象存储抽象 —— 产物（静态 SPA 整目录）上传到对象存储 / CDN。
 *
 * 国内选型：阿里云 OSS / 腾讯云 COS 均兼容 S3 协议，统一用 @aws-sdk/client-s3
 * 通过 endpoint 接入；本地开发无 OSS 时回退到本地文件系统（LocalStorage），
 * 仍以 `/p/<pptId>/` 路径提供访问，便于联调。
 *
 * 访问时完全不经过 Node 进程：CDN 回源到对象存储，web 只返回公开短链。
 */
import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface UploadResult {
  /** 对象存储内产物前缀 key，如 `p/<pptId>/` */
  storageKey: string;
  /** 公开访问 URL（CDN 短链） */
  publicUrl: string;
}

export interface ObjectStorage {
  /** 上传整个目录到 `<storageKey>/` 下，返回公开 URL。 */
  uploadDir(localDir: string, storageKey: string): Promise<UploadResult>;
}

/** CDN 公开 URL：`<CDN_BASE_URL>/<storageKey>/`，无 CDN 时回退到对象存储 endpoint。 */
export function publicUrlFor(storageKey: string): string {
  const base = (process.env.CDN_BASE_URL ?? '').replace(/\/+$/, '');
  const path = storageKey.replace(/^\/+/, '');
  if (base) return `${base}/${path}/`;
  // 无 CDN：用对象存储 endpoint 拼一个直链（仅供联调，生产应有 CDN）
  const ep = (process.env.OBJECT_STORAGE_ENDPOINT ?? '').replace(/\/+$/, '');
  const bucket = process.env.OBJECT_STORAGE_BUCKET ?? '';
  return ep ? `${ep}/${bucket}/${path}/` : `/${path}/`;
}

/** S3 兼容对象存储（阿里云 OSS / 腾讯云 COS / MinIO）。 */
export class S3ObjectStorage implements ObjectStorage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const bucket = process.env.OBJECT_STORAGE_BUCKET;
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
    if (!bucket || !endpoint) {
      throw new Error('S3ObjectStorage 需配置 OBJECT_STORAGE_BUCKET / OBJECT_STORAGE_ENDPOINT');
    }
    this.bucket = bucket;
    this.client = new S3Client({
      region: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
      endpoint,
      // 阿里云 OSS / 腾讯云 COS 需 path-style 关闭；MinIO 需开启。env 显式控制。
      forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY ?? '',
        secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? '',
      },
    });
  }

  async uploadDir(localDir: string, storageKey: string): Promise<UploadResult> {
    const files = walkFiles(localDir);
    for (const abs of files) {
      const rel = relative(localDir, abs).split(sep).join('/');
      const key = `${storageKey.replace(/^\/+|\/+$/g, '')}/${rel}`;
      const body = createReadStream(abs);
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentTypeFor(key),
          // 静态产物公开读，CDN 回源直接拉
          ACL: 'public-read',
          // 收紧 CSP：HTML 入口自带策略，资源由 CDN 同源提供
          ...(key.endsWith('.html')
            ? { CacheControl: 'no-cache' }
            : { CacheControl: 'public, max-age=31536000, immutable' }),
        }),
      );
    }
    return { storageKey: `${storageKey.replace(/^\/+|\/+$/g, '')}/`, publicUrl: publicUrlFor(storageKey) };
  }

  /** 清理旧产物（同 pptId 重新发布时调用）。best-effort，失败不阻断。 */
  async clearPrefix(storageKey: string): Promise<void> {
    const prefix = `${storageKey.replace(/^\/+|\/+$/g, '')}/`;
    let continuation: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuation }),
      );
      const objects = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (objects.length) {
        await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects } }));
      }
      continuation = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuation);
  }
}

/** 本地文件系统存储（开发回退）：写到 LOCAL_STORAGE_ROOT，公开 URL 为相对路径。 */
export class LocalObjectStorage implements ObjectStorage {
  private root: string;

  constructor() {
    this.root = process.env.LOCAL_STORAGE_ROOT ?? join(process.cwd(), '.storage');
    mkdirSync(this.root, { recursive: true });
  }

  async uploadDir(localDir: string, storageKey: string): Promise<UploadResult> {
    const dest = join(this.root, storageKey.replace(/^\/+|\/+$/g, ''));
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const abs of walkFiles(localDir)) {
      const rel = relative(localDir, abs);
      const target = join(dest, rel);
      mkdirSync(join(target, '..'), { recursive: true });
      await pipeline(createReadStream(abs), createWriteStream(target));
    }
    return { storageKey: `${storageKey.replace(/^\/+|\/+$/g, '')}/`, publicUrl: publicUrlFor(storageKey) };
  }
}

/** 工厂：配置了 OSS endpoint 用 S3，否则本地文件系统。 */
export function createObjectStorage(): ObjectStorage {
  if (process.env.OBJECT_STORAGE_ENDPOINT && process.env.OBJECT_STORAGE_BUCKET) {
    return new S3ObjectStorage();
  }
  return new LocalObjectStorage();
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function contentTypeFor(key: string): string {
  if (key.endsWith('.html')) return 'text/html; charset=utf-8';
  if (key.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (key.endsWith('.css')) return 'text/css; charset=utf-8';
  if (key.endsWith('.json')) return 'application/json; charset=utf-8';
  if (key.endsWith('.svg')) return 'image/svg+xml';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.woff2')) return 'font/woff2';
  if (key.endsWith('.woff')) return 'font/woff';
  return 'application/octet-stream';
}

// Readable 导入仅用于类型一致性（stream 上下游）
void Readable;

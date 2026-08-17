import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const HASH_PREFIX = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}`;

@Injectable()
export class PasswordService {
  private dummyHashPromise?: Promise<string>;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await scryptAsync(password, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });

    return `${HASH_PREFIX}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const parsed = this.parseHash(storedHash);
    if (!parsed) {
      return false;
    }

    const derived = await scryptAsync(password, parsed.salt, parsed.keyLength, {
      N: parsed.n,
      r: parsed.r,
      p: parsed.p,
    });

    if (derived.length !== parsed.hash.length) {
      return false;
    }

    return timingSafeEqual(derived, parsed.hash);
  }

  async verifyOrDummy(
    password: string,
    storedHash: string | undefined,
  ): Promise<boolean> {
    const hash = storedHash ?? (await this.getDummyHash());
    return this.verify(password, hash);
  }

  private async getDummyHash(): Promise<string> {
    this.dummyHashPromise ??= this.hash('identity-dummy-password');
    return this.dummyHashPromise;
  }

  private parseHash(storedHash: string): {
    n: number;
    r: number;
    p: number;
    keyLength: number;
    salt: Buffer;
    hash: Buffer;
  } | null {
    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return null;
    }

    const n = Number.parseInt(parts[1], 10);
    const r = Number.parseInt(parts[2], 10);
    const p = Number.parseInt(parts[3], 10);
    if (![n, r, p].every((value) => Number.isFinite(value) && value > 0)) {
      return null;
    }

    try {
      const salt = Buffer.from(parts[4], 'base64url');
      const hash = Buffer.from(parts[5], 'base64url');
      if (salt.length === 0 || hash.length === 0) {
        return null;
      }
      return { n, r, p, keyLength: hash.length, salt, hash };
    } catch {
      return null;
    }
  }
}

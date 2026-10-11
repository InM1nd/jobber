import { describe, it, expect, beforeAll } from 'vitest';
import { encryptApiKey, decryptApiKey } from './encryption';

describe('API Key Encryption', () => {
  beforeAll(() => {
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = '0'.repeat(64);
    }
  });

  it('should encrypt and decrypt a key correctly', () => {
    const originalKey = 'sk-test-1234567890abcdef';
    
    const encrypted = encryptApiKey(originalKey);
    
    expect(encrypted.encryptedKey).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
    expect(encrypted.encryptedKey).not.toBe(originalKey);
    
    const decrypted = decryptApiKey(
      encrypted.encryptedKey,
      encrypted.iv,
      encrypted.authTag
    );
    
    expect(decrypted).toBe(originalKey);
  });

  it('should generate different IVs for same key', () => {
    const key = 'sk-test-same-key';
    
    const encrypted1 = encryptApiKey(key);
    const encrypted2 = encryptApiKey(key);
    
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.encryptedKey).not.toBe(encrypted2.encryptedKey);
    
    expect(decryptApiKey(encrypted1.encryptedKey, encrypted1.iv, encrypted1.authTag)).toBe(key);
    expect(decryptApiKey(encrypted2.encryptedKey, encrypted2.iv, encrypted2.authTag)).toBe(key);
  });

  it('should fail with wrong auth tag', () => {
    const key = 'sk-test-key';
    const encrypted = encryptApiKey(key);
    
    const wrongAuthTag = '0'.repeat(32);
    
    expect(() => {
      decryptApiKey(encrypted.encryptedKey, encrypted.iv, wrongAuthTag);
    }).toThrow();
  });
});

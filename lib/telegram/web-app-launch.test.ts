import { describe, expect, it } from 'vitest';
import {
  initDataFromLocationHash,
  resolveTelegramInitData,
  waitForTelegramInitData,
} from './web-app-launch';

const INIT_DATA = 'query_id=AAE&user=%7B%22id%22%3A42%7D&auth_date=1710000000&hash=abc';

function launchHash(platform: string, initData = INIT_DATA): string {
  return `#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0&tgWebAppPlatform=${platform}`;
}

describe('Telegram launch initData', () => {
  it('reads tgWebAppData for iOS, Android, Desktop, and Web hashes', () => {
    for (const platform of ['ios', 'android', 'tdesktop', 'web']) {
      expect(initDataFromLocationHash(launchHash(platform))).toBe(INIT_DATA);
    }
  });

  it('decodes plus signs the way the Telegram script does', () => {
    expect(initDataFromLocationHash('#tgWebAppData=user%3Dhello+world')).toBe('user=hello world');
  });

  it('reads tgWebAppData when the hash has a path prefix', () => {
    expect(initDataFromLocationHash(`#/dashboard/matches?tgWebAppData=${encodeURIComponent(INIT_DATA)}`)).toBe(
      INIT_DATA,
    );
  });

  it('prefers SDK initData and falls back to the hash only when that is empty', () => {
    const hash = launchHash('ios');
    expect(resolveTelegramInitData('from-sdk', hash)).toBe('from-sdk');
    expect(resolveTelegramInitData('   ', hash)).toBe(INIT_DATA);
    expect(resolveTelegramInitData(undefined, '#tgWebAppVersion=8.0')).toBe('');
    expect(resolveTelegramInitData('', '')).toBe('');
  });

  it('falls back to the hash when the SDK is ready but initData is empty', async () => {
    let slept = false;
    const initData = await waitForTelegramInitData({
      readSdkInitData: () => '',
      readHash: () => launchHash('android'),
      isSdkReady: () => true,
      timeoutMs: 2000,
      intervalMs: 50,
      now: () => 0,
      sleep: async () => {
        slept = true;
      },
    });
    expect(initData).toBe(INIT_DATA);
    expect(slept).toBe(false);
  });

  it('waits past a 50ms glance for initData that arrives with the SDK', async () => {
    let sdk = '';
    let ready = false;
    let t = 0;
    const initData = await waitForTelegramInitData({
      readSdkInitData: () => sdk,
      readHash: () => launchHash('web'),
      isSdkReady: () => ready,
      timeoutMs: 500,
      intervalMs: 50,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
        if (t >= 200) {
          ready = true;
          sdk = 'from-sdk';
        }
      },
    });
    expect(initData).toBe('from-sdk');
    expect(t).toBeGreaterThan(50);
  });

  it('uses the hash after the timeout when the SDK never loads', async () => {
    let t = 0;
    const initData = await waitForTelegramInitData({
      readSdkInitData: () => '',
      readHash: () => launchHash('tdesktop'),
      isSdkReady: () => false,
      timeoutMs: 150,
      intervalMs: 50,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });
    expect(initData).toBe(INIT_DATA);
    expect(t).toBeGreaterThanOrEqual(150);
  });

  it('returns empty only after the timeout when initData never arrives', async () => {
    let t = 0;
    const initData = await waitForTelegramInitData({
      readSdkInitData: () => '',
      readHash: () => '#tgWebAppVersion=8.0&tgWebAppPlatform=web',
      isSdkReady: () => false,
      timeoutMs: 150,
      intervalMs: 50,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });
    expect(initData).toBe('');
    expect(t).toBeGreaterThanOrEqual(150);
  });
});
